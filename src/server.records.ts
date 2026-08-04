import { formatUnknownError, log } from './logger';
import {
  // type CollectionRecord,
  type CollectionResult,
  type CollectionSource
} from './records';

// const collectionRegistry = new Map<string, CollectionSource[]>();

/**
 * Register a collection callback
 *
 * @param name
 * @param callback
 */
/*
const registerCollection = (
  name: string,
  callback: () => Promise<CollectionResult> | CollectionResult
) => {
  log.info(`Collection [${name}] registered in resources layer.`);
  // void blendCollections(name, callback);

  return new Promise((resolve, reject) => {
    try {
      const response = callback(); // type `(parameter) callback: () => Promise<CollectionResult> | CollectionResult`

      collectionRegistry.set(name, response);

      resolve(response);
    } catch (error) {
      reject(new Error(`Failed to load collection: ${unknownError(error)}`, { cause: error }));
    }
  });
};

const registerCollections = async (collections, parser) => {
  log.info(`Registering `);
};

export {
  registerCollection
};
*/

/**
 * Registers multiple collections.
 *
 * @param collections - Array of objects containing a name and a loader function
 * @param parser - Optional function that takes the array of results and returns a transformed array
 * @param onUpdate - Optional callback fired every time an individual collection resolves or rejects
 * @returns A promise resolving to the array of successful, parsed results
 */
/*
const registerCollections = async <T>(
  collections: { name: string; loader: () => Promise<T> | T }[],
  parser?: (results: T[]) => T[],
  onUpdate?: (name: string, result?: T, error?: any) => void
): Promise<T[]> => {
  log.info(`Initiating registration for ${collections.length} collections...`);

  // 1. Create a wrapper for each loader to handle incremental updates
  const registrationPromises = collections.map(async ({ name, loader }) => {
    try {
      const result = await loader();

      onUpdate?.(name, result);

      return result;
    } catch (error) {
      onUpdate?.(name, undefined, error);
      throw error;
    }
  });

  // 2. Wait for all loaders to settle
  const settledResults = await Promise.allSettled(registrationPromises);

  // 3. Map results to track names and status
  const outcomes = settledResults.map((res, index) => ({
    name: collections[index].name,
    status: res.status,
    value: res.status === 'fulfilled' ? res.value : null,
    reason: res.status === 'rejected' ? res.reason : null
  }));

  // 4. Separate successes and log failures
  const success = outcomes.filter(response => response.status === 'fulfilled');
  const failed = outcomes.filter(response => response.status === 'rejected');

  failed.forEach(failure => {
    log.error(`Failed to register collection [${failure.name}]: ${failure.reason}`);
  });

  // 5. Extract successful values
  const successValues = success.map(response => response.value as T);

  // 6. Apply global parser (if provided) to the successful batch
  const finalValues = parser ? parser(successValues) : successValues;

  // 7. Populate the registry
  success.forEach((outcome, index) => {
    collectionRegistry.set(outcome.name, finalValues[index]);
  });

  log.info(`Registration complete. ${success.length}/${collections.length} succeeded.`);

  // 8. Return the final results (The Promise resolves to this)
  return finalValues;
};
*/

type RegisterCollectionItem = {
  name: string;
  response?: CollectionResult | undefined;
  error?: unknown;
};

type RegisterOnUpdate = ({ name, response, error }: RegisterCollectionItem) => void;

type RegisterOnRequired = (requiredCollections: RegisterCollectionItem[]) => void;

type RegisterCollectionSettledItem = {
  name: string | null;
  status: 'fulfilled' | 'rejected';
  value: CollectionResult | unknown;
  reason: any | null;
};

type RegisterCollectionsResult = {
  settled: RegisterCollectionSettledItem[];
  fulfilled: CollectionResult[];
  rejected: { name: string | null, reason: any }[]; // Changed to capture actual error info
};

/**
 * Registers a set of collections asynchronously.
 *
 * - Required collections gatekeep `registerCollections` resolve.
 *    - See {@link CollectionSource} for configuration details.
 * - When a collection resolves, `onUpdate` is called.
 * - When the required collections resolve, `onRequired` is called.
 * - When all collections are settled `onSettle` is called.
 *
 * @param {CollectionSource[]} collections - An array of collection sources to be registered. Each source is represented as a tuple.
 * @param [options] - Options callback functions to handle registration events.
 * @param [options.onSettle] - Callback function executed after all collection
 *     registrations are settled. Receives the results as an object containing settled, fulfilled, and rejected collections.
 * @param [options.onUpdate] - Callback function executed for each collection
 *     registration update. Receives details about the collection being processed including name, response, and any error encountered.
 * @param [options.onRequired] - Callback function executed when required
 *     collections are processed. Receives an array of results containing collection name, response, and error details.
 * @returns Resolves when all "isRequired" collections are registered and settled.
 * @throws {Error} If any required collection fails to register successfully.
 */
const registerCollections = async (
  collections: CollectionSource[],
  { onSettle, onUpdate, onRequired }: {
    onSettle?: (results: RegisterCollectionsResult) => void, onUpdate?: RegisterOnUpdate, onRequired?: RegisterOnRequired
  } = {}
): Promise<void> => {
  log.info(`Initiating registration for ${collections.length} collections.`);

  // Wrapper for each loader; handle incremental updates
  const registrationPromises = collections.map(async ([name, callback]) => {
    let error: unknown | undefined;
    let response: CollectionResult | undefined;
    let isSuccess = false;

    try {
      response = await callback();
      isSuccess = true;
    } catch (err) {
      error = err;
      log.error(`Error loading collection [${name}]: ${formatUnknownError(err)}`);
    }

    try {
      onUpdate?.({ name, response, error });
    } catch (err) {
      log.error(`Error "onUpdate" for collection [${name}]: ${formatUnknownError(err)}`);
    }

    return { name, response, isSuccess, error };
  });

  // Determine which collections are required and optional
  const required = registrationPromises.filter((_, index) => collections[index]?.[2]?.isRequired);
  // const optional = registrationPromises.filter((_, index) => !collections[index]?.[2]?.isRequired);

  // Gatekeep on any required collections
  const results = await Promise.all(required);

  for (const res of results) {
    if (!res.isSuccess) {
      const requiredCollectionsFail = `Required collection [${res.name}] failed to load.`;

      log.debug(requiredCollectionsFail);
      throw new Error(requiredCollectionsFail);
    }
  }

  try {
    onRequired?.(results.map(({ name, response, error }) => ({ name, response, error })));
  } catch (err) {
    log.error(`Error calling "onRequired": ${formatUnknownError(err)}`);
  }

  // Wait for all loaders to settle
  Promise.all(registrationPromises).then(allResults => {
    // Map results to track names and results
    const settled = allResults.map((res, index) => {
      const item: RegisterCollectionSettledItem = {
        name: collections[index]?.[0] || null,
        status: res.isSuccess ? 'fulfilled' : 'rejected',
        value: res.isSuccess ? res.response : null,
        reason: res.isSuccess ? null : res.error
      };

      if (!res.isSuccess) {
        log.error(`Failed to register collection [${item.name}]: ${item.reason}`);
      } else {
        log.info(`Register collection [${item.name}].`);
      }

      return item;
    });

    // Filter results
    const fulfilled = settled
      .filter(item => item.status === 'fulfilled')
      .map(item => item.value as CollectionResult);

    const rejected = settled
      .filter(item => item.status === 'rejected')
      .map(item => ({ name: item.name, reason: item.reason }));

    const returnValues = { settled, fulfilled, rejected };

    // Fire onSettle if it exists
    try {
      onSettle?.(returnValues);
    } catch (err) {
      throw new Error(`Error calling "onSettle" ${formatUnknownError(err)}`);
    }
  }).catch(err => {
    log.error(`Failed to settle collections: ${err}`);
  });
};

export {
  registerCollections,
  type RegisterCollectionsResult,
  type RegisterCollectionItem
};

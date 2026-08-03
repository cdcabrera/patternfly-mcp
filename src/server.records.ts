import { log } from './logger';
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

type RegisterOnUpdateItem = {
  name: string;
  response?: CollectionResult | undefined;
  error?: unknown;
};

type RegisterOnUpdate = ({ name, response, error }: RegisterOnUpdateItem) => void;

/*
type RegisterCollectionsPromiseSettledResult<T = undefined> = PromiseSettledResult<T> & {
  name: string | null;
};

type RegisterCollectionsResult = {
  settled: RegisterCollectionsPromiseSettledResult<CollectionResult | null>[];
  fulfilled: (CollectionResult | null)[];
  rejected: (CollectionResult | null)[];
};
*/
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

const registerCollections = async (
  collections: CollectionSource[],
  { onComplete, onUpdate }: { onComplete?: (results: RegisterCollectionsResult) => void, onUpdate?: RegisterOnUpdate } = {}
): Promise<RegisterCollectionsResult> => {
  log.info(`Initiating registration for ${collections.length} collections.`);

  // Wrapper for each loader to handle incremental updates
  const registrationPromises = collections.map(async ([name, callback]) => {
    try {
      const response = await callback();

      onUpdate?.({ name, response, error: undefined });

      return response;
    } catch (error) {
      onUpdate?.({ name, response: undefined, error });
      throw error;
    }
  });

  // Wait for all loaders to settle
  const settledResults = await Promise.allSettled(registrationPromises);

  // Map results to track names and results
  const settled = settledResults.map((res, index) => {
    const item = {
      name: collections[index]?.[0] || null,
      status: res.status,
      value: res.status === 'fulfilled' ? res.value : null,
      reason: res.status === 'rejected' ? res.reason : null
    };

    if (res.status === 'rejected') {
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

  // Fire onComplete if it exists
  onComplete?.(returnValues);

  // Return results
  return returnValues;

  // 7. Populate the registry
  // success.forEach((outcome, index) => {
  //  collectionRegistry.set(outcome.name, finalValues[index]);
  // });

  // log.info(`Registration complete. ${success.length}/${collections.length} succeeded.`);

  /*
  // 8. Return the final results (The Promise resolves to this)
  return {
    fulfilled: finalValues,
    error: failedValues
  };
  */
};

export {
  registerCollections,
  type RegisterCollectionsResult,
  type RegisterOnUpdateItem
};

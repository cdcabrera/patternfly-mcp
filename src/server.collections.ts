import { formatUnknownError, log } from './logger';
import {
  // type CollectionRecord,
  type CollectionResult,
  type CollectionSource
} from './collections';

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

import { generateHash, isPromise } from './server.helpers';

type CacheHandlerResponse<TValue = unknown> = {
  remaining: Array<TValue>;
  removed: Array<TValue>;
  all: Array<TValue>
};

type OnCacheHandler<TValue = unknown> = (cache: CacheHandlerResponse<TValue>) => any | Promise<any>;

/**
 * Memoization options
 */
interface MemoOptions<TValue = unknown> {
  cacheErrors?: boolean;
  cacheLimit?: number;
  debug?: (info: { type: string; value: unknown; cache: unknown[] }) => void;
  expire?: number;
  onCacheExpire?: OnCacheHandler<TValue>;
  onCacheRollout?: OnCacheHandler<TValue>;
}

/**
 * Simple argument-based memoize with adjustable cache limit, and extendable cache expire.
 * apidoc-mock: https://github.com/cdcabrera/apidoc-mock.git
 *
 * - `Zero-arg caching`: Zero-argument calls are memoized. To disable caching and perform a manual reset on every call, set cacheLimit <= 0.
 * - `Expiration`: Expiration expands until a pause in use happens. All results, regardless of type, will be expired.
 * - `Promises`: Allows for promises and promise-like functions
 * - `Errors`: It's on the consumer to catch function errors and await or process a Promise resolve/reject/catch.
 *
 * @param {Function} func - A function or promise/promise-like function to memoize
 * @param {object} [options] - Configuration options
 * @param {boolean} [options.cacheErrors] - Memoize errors, or don't (default: true). For async errors, a promise is cached.
 *     When the promise errors/rejects/catches, it is removed from the cache.
 * @param {number} [options.cacheLimit] - Number of entries to cache before overwriting previous entries (default: 1)
 * @param {Function} [options.debug] - Debug callback function (default: Function.prototype)
 * @param {number} [options.expire] - Expandable milliseconds until cache expires
 * @param {Function} [options.onCacheExpire] - Callback when cache expires (only fires if `expire` option is set), receives array of { key, value } entries
 * @param {Function} [options.onCacheRollout] - Callback when cache entries are rolled off due to cache limit, receives array of { key, value } entries
 * @returns {Function} Memoized function
 */
const memo = <TArgs extends any[], TReturn = any>(
  func: (...args: TArgs) => TReturn,
  {
    cacheErrors = true,
    cacheLimit = 1,
    debug = () => {},
    expire,
    onCacheExpire,
    onCacheRollout
  }: MemoOptions<TReturn> = {}
): (...args: TArgs) => TReturn => {
  const isCacheErrors = Boolean(cacheErrors);
  const isFuncPromise = isPromise(func);
  const isOnCacheExpirePromise = isPromise(onCacheExpire);
  const isOnCacheExpire = typeof onCacheExpire === 'function' || isOnCacheExpirePromise;
  const isOnCacheRolloutPromise = isPromise(onCacheRollout);
  const isOnCacheRollout = typeof onCacheRollout === 'function' || isOnCacheRolloutPromise;
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;

  const ized = function () {
    const cache: any[] = [];
    let timeout: NodeJS.Timeout | undefined;

    return (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          // Call onCacheExpire
          if (isOnCacheExpire) {
            const allCacheEntries: Array<TReturn> = [];

            cache.forEach((entry, index) => {
              if (index % 2 === 0) {
                allCacheEntries.push(cache[index + 1] as TReturn);
              }
            });

            const cacheEntries = { remaining: [], removed: allCacheEntries, all: allCacheEntries };

            if (isOnCacheExpirePromise) {
              Promise.resolve(onCacheExpire?.(cacheEntries)).catch(console.error);
            } else {
              try {
                onCacheExpire?.(cacheEntries);
              } catch (error) {
                console.error(error);
              }
            }
          }

          cache.length = 0;
        }, updatedExpire);

        // Allow the process to exit
        timeout.unref();
      }

      // Zero cacheLimit, reset and bypass memoization
      if (isMemo === false) {
        cache.length = 0;
        const bypassValue = func.call(null, ...args);

        debug({
          type: 'memo bypass',
          value: () => bypassValue,
          cache: []
        });

        return bypassValue;
      }

      const key = generateHash(args);

      // Parse, memoize and return the original value
      if (cache.indexOf(key) < 0) {
        if (isFuncPromise) {
          const promiseResolve = Promise
            .resolve(func.call(null, ...args))
            .catch((error: any) => {
              const promiseKeyIndex = cache.indexOf(key);

              // Remove the promise
              if (isCacheErrors === false && promiseKeyIndex >= 0) {
                cache.splice(promiseKeyIndex, 2);
              }

              return Promise.reject(error);
            });

          // Cache the promise
          cache.unshift(key, promiseResolve);
        } else {
          try {
            cache.unshift(key, func.call(null, ...args));
          } catch (error) {
            // Wrap a sync error in a function and cache it
            const errorFunc = () => {
              throw error;
            };

            (errorFunc as any).isError = true;
            cache.unshift(key, errorFunc);
          }
        }

        // Run after cache update to run callback and trim
        if (isMemo) {
          if (isOnCacheRollout && cache.length > cacheLimit * 2) {
            const allCacheEntries: Array<TReturn> = [];

            cache.forEach((entry, index) => {
              if (index % 2 === 0) {
                allCacheEntries.push(cache[index + 1] as TReturn);
              }
            });

            const removedCacheEntries = allCacheEntries.slice(cacheLimit);

            if (removedCacheEntries.length > 0) {
              const remainingCacheEntries = allCacheEntries.slice(0, cacheLimit);
              const cacheEntries = { remaining: remainingCacheEntries, removed: removedCacheEntries, all: allCacheEntries };

              if (isOnCacheRolloutPromise) {
                Promise.resolve(onCacheRollout?.(cacheEntries)).catch(console.error);
              } else {
                try {
                  onCacheRollout?.(cacheEntries);
                } catch (error) {
                  console.error(error);
                }
              }
            }
          }

          cache.length = cacheLimit * 2;
        }
      }

      // Return memoized value
      const updatedKeyIndex = cache.indexOf(key);
      const cachedValue = cache[updatedKeyIndex + 1];

      // If the cached value is a sync error, remove it from the cache
      if (cachedValue?.isError === true) {
        if (isCacheErrors === false) {
          cache.splice(updatedKeyIndex, 2);
        }

        debug({
          type: 'memo error',
          value: cachedValue,
          cache: [...cache]
        });

        return cachedValue();
      }

      debug({
        type: `memo${(isFuncPromise && ' promise') || ''}`,
        value: () => cachedValue,
        cache: [...cache]
      });

      return cachedValue;
    };
  };

  return ized();
};

export { memo, type CacheHandlerResponse, type MemoOptions, type OnCacheHandler };

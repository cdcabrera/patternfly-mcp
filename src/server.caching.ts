import { generateHash, isPromise } from './server.helpers';

/**
 * Memoization options
 */
interface MemoOptions<TValue = unknown> {
  cacheErrors?: boolean;
  cacheLimit?: number;
  debug?: (info: { type: string; value: unknown; cache: unknown[] }) => void;
  expire?: number;
  onCacheExpire?: (entries: Array<{ key: string; value: TValue }>) => void | Promise<void>;
  onCacheRollout?: (entries: Array<{ key: string; value: TValue }>) => void | Promise<void>;
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
 * @param {boolean} [options.cacheErrors] - Memoize errors, or don't (default: true)
 * @param {number} [options.cacheLimit] - Number of entries to cache before overwriting previous entries (default: 1)
 * @param {Function} [options.debug] - Debug callback function (default: Function.prototype)
 * @param {number} [options.expire] - Expandable milliseconds until cache expires
 * @param {Function} [options.onCacheExpire] - Callback when cache expires (only fires if `expire` option is set), receives array of { key, value } entries
 * @param {Function} [options.onCacheRollout] - Callback when cache entries are rolled off due to cache limit, receives array of { key, value } entries
 * @returns {Function} Memoized function
 */
const memo = <TArgs extends any[], TReturn>(
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
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;

  const ized = function () {
    const cache: any[] = [];
    let timeout: NodeJS.Timeout | undefined;

    return (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          // Build entries array before clearing cache
          const entries: Array<{ key: string; value: TReturn }> = [];

          for (let i = 0; i < cache.length; i += 2) {
            entries.push({
              key: cache[i] as string,
              value: cache[i + 1] as TReturn
            });
          }

          cache.length = 0;

          // Call onCacheExpire handler
          if (onCacheExpire) {
            Promise.resolve(onCacheExpire(entries)).catch(console.error);
          }
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

              if (isCacheErrors === false && promiseKeyIndex >= 0) {
                cache.splice(promiseKeyIndex, 2);
              }

              return Promise.reject(error);
            });

          cache.unshift(key, promiseResolve);
        } else {
          try {
            cache.unshift(key, func.call(null, ...args));
          } catch (error) {
            const errorFunc = () => {
              throw error;
            };

            (errorFunc as any).isError = true;
            cache.unshift(key, errorFunc);
          }
        }

        // Run after cache update to trim
        if (isMemo) {
          // Check if we need to trim and collect rolled-off entries
          if (cache.length > cacheLimit * 2) {
            // Build entries array for rolled-off entries (entries beyond cacheLimit * 2)
            const rolledOffEntries: Array<{ key: string; value: TReturn }> = [];

            for (let i = cacheLimit * 2; i < cache.length; i += 2) {
              rolledOffEntries.push({
                key: cache[i] as string,
                value: cache[i + 1] as TReturn
              });
            }

            // Trim cache to limit
            cache.length = cacheLimit * 2;

            // Call onCacheRollout handler
            if (onCacheRollout && rolledOffEntries.length > 0) {
              Promise.resolve(onCacheRollout(rolledOffEntries)).catch(console.error);
            }
          }
        }
      }

      // Return memoized value
      const updatedKeyIndex = cache.indexOf(key);
      const cachedValue = cache[updatedKeyIndex + 1];

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

export { memo, type MemoOptions };

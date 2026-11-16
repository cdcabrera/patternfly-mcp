import {
  generateHash,
  isPromise,
  isReferenceLike
} from './server.helpers';
import { log } from './logger';

/**
 * Read-only facts about the memo instance, handed to a cache factory.
 *
 * @property isFuncPromise - `true` when the memoized function is async / returns a Promise-like.
 * @property cacheErrors - Mirrors the `cacheErrors` option.
 * @property cacheLimit - Mirrors the `cacheLimit` option.
 * @property expire - Mirrors the (parsed) `expire` option, `undefined` when not set.
 */
interface MemoCacheContext {
  readonly isFuncPromise?: boolean | undefined;
  readonly cacheErrors?: boolean | undefined;
  readonly cacheLimit?: number | undefined;
  readonly expire?: number | undefined;
}

/**
 * Alternative callback used to return a map-like cache for memo entries.
 *
 * @template TReturn Return type stored in each memo cache entry.
 *
 * @param {MemoCacheContext} [context] - Memo context associated with the current operation.
 * @returns {MemoMapLike<unknown, MemoCacheEntry<TReturn>>} A map-like cache containing memo entries for the return type.
 */
type MemoCacheCallback<TReturn> =
  (context?: MemoCacheContext) => MemoMapLike<unknown, MemoCacheEntry<TReturn>>;

/**
 * Map-like interface consumed by `memo`.
 *
 * All properties are applied synchronously, never awaited; write return values are ignored.
 *
 * @note
 * Optional members enable optional features:
 * - `size` + `keys` + `delete`: `cacheLimit` eviction and `onCacheRollout`. Omit any one to disable both.
 *     Eviction trims excess entries on cache misses using `size` read once. Custom adapters should keep
 *     `size`, `keys()`, and `delete()` synchronously coordinated to prevent lingering excess entries.
 * - `entries`: callback payloads and `debug` snapshots. When omitted, snapshots are empty and
 *     `onCacheRollout` is skipped.
 * - `clear`: `expire`, `cacheLimit <= 0`, and `memoized.clear()`. When omitted, those paths skip the cache.
 *     `memoized.clear()` always invokes it, even when `entries` is omitted or the snapshot is empty.
 *
 * Adapters bridging a persistent or async cache should resolve values before `memo` reads them.
 * To handle returning Promises with the map-like methods requires `memo` being provided with an async function,
 * see {@link MemoCacheContext.isFuncPromise}.
 *
 * @template K Key type.
 * @template V Value type.
 *
 * @property [clear] - Remove all entries.
 * @property [delete] - Remove an entry by key.
 * @property [entries] - Iterate `[key, value]` pairs in insertion order.
 * @property get - **Required**. Return the stored value, handed to the caller as is.
 * @property has - **Required**. Return `true` when the key exists.
 * @property [keys] - Iterate keys in insertion order, oldest first.
 * @property set - **Required**. Store a value by key.
 * @property [size] - Current entry count.
 */
interface MemoMapLike<K, V> {
  clear?(): unknown;
  delete?(key: K): unknown;
  entries?(): IterableIterator<[K, V]>;
  get(key: K): V | undefined | Promise<V | undefined>;
  has(key: K): boolean;
  keys?(): IterableIterator<K>;
  set(key: K, value: V): unknown;
  readonly size?: number | undefined;
}

/**
 * Error wrapper for memoized synchronous errors.
 */
type MemoErrorFunction = (() => never) & { isError: boolean };

/**
 * Union of possible cache entry values stored in a memo cache.
 *
 * @template TReturn Return type of the memoized function.
 */
type MemoCacheEntry<TReturn = unknown> = TReturn | Promise<TReturn> | MemoErrorFunction;

/**
 * Memo cache map.
 *
 * @template TReturn Return type of the memoized function.
 */
type MemoCache<TReturn = unknown> = Map<unknown, MemoCacheEntry<TReturn>>;

/**
 * Memo cache handler response parameters.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property {Map<unknown, TReturn>} remaining Map of cache entries that were NOT removed from the cache due to cache limit.
 * @property {Map<unknown, TReturn>} removed Map of cache entries that were removed from the cache due to cache limit.
 * @property {Map<unknown, TReturn>} all Map of all cache entries, including removed entries.
 */
type MemoCacheHandlerResponse<TReturn = unknown> = {
  remaining: Map<unknown, TReturn>;
  removed: Map<unknown, TReturn>;
  all: Map<unknown, TReturn>;
};

/**
 * Memo cache handler callback.
 *
 * Return values are ignored. Thrown errors are logged but not propagated.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param {MemoCacheHandlerResponse<TReturn>} cache Memo cache handler response.
 */
type OnMemoCacheHandler<TReturn = unknown> = (cache: MemoCacheHandlerResponse<TReturn>) => void | Promise<void>;

/**
 * Debug handler callback.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param info - Object containing debugging information.
 * @param info.type - Information debugging category.
 * @param info.value - Value associated with the debug operation.
 * @param {MemoCache<TReturn>} info.cache - MemoCache Map
 */
type MemoDebugHandler<TReturn = unknown> = (info: { type: string; value: unknown; cache: MemoCache<TReturn> }) => void;

/**
 * notifyCacheChange handler options.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property {MemoCache<TReturn>} all - Full cache reflecting the current state before the change.
 * @property {MemoCache<TReturn>} remaining - Cache items that remain after the change.
 * @property {MemoCache<TReturn>} removed - Cache items that were removed as a result of the change.
 * @property {OnMemoCacheHandler<TReturn> | undefined} handler - Optional handler function to be invoked for the cache change.
 * @property handlerDescription - Optional descriptive about the handler, typically for logging or debugging purposes.
 */
type MemoNotifyCacheChangeOptions<TReturn = unknown> = {
  all: MemoCache<TReturn>;
  remaining: MemoCache<TReturn>;
  removed: MemoCache<TReturn>;
  handler: OnMemoCacheHandler<TReturn> | undefined;
  handlerDescription: string | undefined;
};

/**
 * Memo configuration options.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property [cacheErrors] Memoize errors, or don't (default: true). For async errors, a promise is cached.
 *     When the promise errors/rejects/catches, it is removed from the cache.
 * @property [cacheLimit] Number of entries to cache before overwriting previous entries (default: 1)
 * @property {MemoDebugHandler<TReturn>} [debug] Debug callback function
 * @property [expire] Expandable milliseconds until cache expires
 * @property [keyHash] Function to generate a predictable hash key from the provided arguments. Defaults to internal `generateHash`.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheClear] Callback when `memoized.clear()` is invoked. Payload maps
 *     reflect observable entries and may be empty.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheExpire] Callback when cache expires. Only fires when the `expire` option is set.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheRollout] Callback when cache entries are rolled off due to cache limit.
 * @property {Map<unknown, MemoCacheEntry<TReturn>> |
 *     MemoMapLike<unknown, MemoCacheEntry<TReturn>> |
 *     MemoCacheCallback<TReturn>} [cache] Custom Map or MapLike cache. Defaults to an internal Map.
 */
interface MemoOptions<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  cacheErrors?: boolean;
  cacheLimit?: number;
  debug?: MemoDebugHandler<TReturn>;
  expire?: number;
  keyHash?: (args: Readonly<TArgs>, ..._forbidRest: never[]) => unknown;
  onCacheClear?: OnMemoCacheHandler<TReturn>;
  onCacheExpire?: OnMemoCacheHandler<TReturn>;
  onCacheRollout?: OnMemoCacheHandler<TReturn>;
  cache?: Map<unknown, MemoCacheEntry<TReturn>> | MemoMapLike<unknown, MemoCacheEntry<TReturn>> | MemoCacheCallback<TReturn>;
}

/**
 * Return type of `memoize`.
 *
 * @property clear Clear all cache entries.
 */
type MemoReturn<TArgs extends unknown[] = unknown[], TReturn = unknown> = ((...args: TArgs) => TReturn) & {
  clear: () => boolean;
};

/**
 * Helper for checking if a value is a map-like cache.
 *
 * @param value - Value to check.
 */
const isMapLike = <TReturn>(value: unknown): value is MemoMapLike<unknown, MemoCacheEntry<TReturn>> =>
  isReferenceLike(value) &&
  typeof (value as MemoMapLike<unknown, unknown>).has === 'function' &&
  typeof (value as MemoMapLike<unknown, unknown>).get === 'function' &&
  typeof (value as MemoMapLike<unknown, unknown>).set === 'function';

/**
 * Wraps a map-like memo cache target in a normalized interface.
 *
 * Native Maps are returned as is. Map-like objects are wrapped with
 * methods to normalize their behavior when used with {@link memo}.
 *
 * @template TReturn The memoized return value type stored in cache entries.
 *
 * @param target Map-like cache to normalize methods.
 * @returns A normalized methods map-like cache interface for memo cache entries.
 */
const normalizeMapLike = <TReturn>(
  target: MemoMapLike<unknown, MemoCacheEntry<TReturn>>
) => {
  if (target instanceof Map) {
    return target;
  }

  return {
    has: (key: unknown) => Boolean(target.has(key)),
    get: (key: unknown) => target.get(key),
    set: (key: unknown, value: MemoCacheEntry<TReturn>) => target.set(key, value),
    clear: () => target.clear?.(),
    delete: (key: unknown) => target.delete?.(key),
    entries: () => target.entries?.() ?? new Map<unknown, MemoCacheEntry<TReturn>>().entries(),
    keys: () => target.keys?.() ?? new Map<unknown, MemoCacheEntry<TReturn>>().keys(),
    get size() {
      // Size, keys, and delete are required together for cacheLimit eviction.
      return typeof target.size === 'number' && typeof target.keys === 'function' && typeof target.delete === 'function'
        ? target.size
        : undefined;
    }
  };
};

/**
 * Helper for normalizing a memo cache into a usable map-like cache.
 *
 * @template TReturn Memoized function return type stored in cache entries.
 *
 * @param cache - Cache to normalize. Falsy values return the default map.
 * @param [options] - Optional normalization settings.
 * @param [options.cacheContext] - Context passed to a cache factory when `cache` is a function.
 * @param [options.debug] - Debug handler. Notified when cache normalization falls back because of an error.
 * @returns A map-like cache suitable for storing memoization entries.
 */
const normalizeMemoCache = <TReturn>(
  cache: unknown,
  { cacheContext = {}, debug }: { cacheContext?: MemoCacheContext | undefined; debug?: MemoDebugHandler<TReturn> | undefined } = {}
): Required<MemoMapLike<unknown, MemoCacheEntry<TReturn>>> => {
  const updatedDebug = typeof debug === 'function' ? debug : () => {};

  const logErrors = (error: unknown) => {
    log.error('Memoized cache error. Using internal fallback Map.', error);

    updatedDebug({
      type: 'memo cache error',
      value: error,
      cache: new Map()
    });
  };

  if (cache) {
    try {
      if (typeof cache === 'function') {
        const created: unknown = cache(cacheContext);

        if (isMapLike<TReturn>(created)) {
          return normalizeMapLike<TReturn>(created);
        }
      } else if (isMapLike<TReturn>(cache)) {
        return normalizeMapLike<TReturn>(cache);
      }

      throw new TypeError('Cache must be a map-like object with has/get/set, or a callback that returns one.');
    } catch (error) {
      logErrors(error);
    }
  }

  return new Map();
};

/**
 * Simple argument-based memoize with adjustable cache limit, and extendable cache expire.
 * apidoc-mock: https://github.com/cdcabrera/apidoc-mock.git
 *
 * - A synchronous wrapper that expects consumers to correctly handle returned values.
 * - `Zero-arg caching`: Zero-argument calls are memoized. To disable caching and perform a manual reset on every
 *     call, set cacheLimit <= 0.
 * - `Expiration`: Expiration expands until a pause in use happens. All results, regardless of type, will be expired.
 * - `Eviction and custom caches`: On a cache miss, `memo` adds the new entry, then trims using `size` read once
 *     and a fixed number of oldest-key deletions. With a native `Map` this works as intended. But with a custom
 *     cache, if `size`, `keys()`, and `delete` are not kept in sync, this eviction trim may stop early and leave
 *     additional cache entries over the specified cap. The cache will self-heal on later cache misses. If you are
 *     using a custom adapter AND you want to leverage the eviction behavior, ensure that `size`, `keys()`, and `delete`
 *     are kept in sync. If strict single-entry cache memoization, or exact limit enforcement, is required, we highly
 *     recommend using a native Map.
 *
 * @note **Future work**: Review adding in a minor `typeof func === 'function'` mod to the `Promise.resolve`. It would
 *     allow actual promise handling.
 *
 * @template TArgs Arguments passed to the provided function represented as an array.
 * @template TReturn Return type of the provided/memoized function.
 *
 * @param {(...args: TArgs) => TReturn} func The function, or async function, to memoize
 * @param {MemoOptions<TArgs, TReturn>} [options] Configuration options. See {@link MemoOptions}.
 * @returns Memoized function
 *
 * @throws {Error} If an error occurs during function execution and `cacheErrors` is set to `false`,
 *     the error will not be cached and will need to be addressed by the caller. It's on the consumer to catch
 *     function errors and await or process a Promise resolve/reject/catch.
 */
const memo = <TArgs extends unknown[], TReturn = unknown>(
  func: (...args: TArgs) => TReturn,
  {
    cacheErrors = true,
    cacheLimit = 1,
    debug = () => {},
    expire,
    keyHash = generateHash,
    onCacheClear,
    onCacheExpire,
    onCacheRollout,
    cache: customCache
  }: MemoOptions<TArgs, TReturn> = {}
): MemoReturn<TArgs, TReturn> => {
  const isCacheErrors = Boolean(cacheErrors);
  const isFuncPromise = isPromise(func);
  const isOnCacheExpirePromise = isPromise(onCacheExpire);
  const isOnCacheExpire = typeof onCacheExpire === 'function' || isOnCacheExpirePromise;
  const isOnCacheRolloutPromise = isPromise(onCacheRollout);
  const isOnCacheRollout = typeof onCacheRollout === 'function' || isOnCacheRolloutPromise;
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;
  const setKey = function (value: TArgs): unknown {
    return keyHash.call(null, value);
  };

  /**
   * Notify callback handlers.
   *
   * @template TReturn - See {@link MemoCache}
   * @param params - Passed parameters.
   * @param {MemoCache<TReturn>} params.all - The current state of the entire memoized cache.
   * @param {MemoCache<TReturn>} params.remaining - A subset of items that have not been removed from the cache.
   * @param {MemoCache<TReturn>} params.removed - A subset of items that have been removed from the cache.
   * @param {OnMemoCacheHandler<TReturn>|undefined} params.handler - See {@link OnMemoCacheHandler}
   * @param {string|undefined} params.handlerDescription - A description of the handler.
   */
  const notifyCacheChange = ({
    all, remaining, removed, handler, handlerDescription
  }: MemoNotifyCacheChangeOptions<TReturn>) => {
    if (!handler) {
      return;
    }

    const errorDesc = handlerDescription ? `: ${handlerDescription}` : '';
    const payload: MemoCacheHandlerResponse<TReturn> = {
      all: all as Map<unknown, TReturn>,
      remaining: remaining as Map<unknown, TReturn>,
      removed: removed as Map<unknown, TReturn>
    };

    if (isPromise(handler)) {
      Promise.resolve(handler(payload)).catch(error => log.error(`Memoized handler error${errorDesc}`, error));
    } else if (typeof handler === 'function') {
      try {
        handler(payload);
      } catch (error) {
        log.error(`Memoized function error${errorDesc}`, error);
      }
    }
  };

  /**
   * Confirm the value has a memo error marker.
   *
   * @param value - The value to inspect.
   * @returns `true` when the value is a memo error marker; otherwise, `false`.
   */
  const isMemoError = (value: unknown): value is { isError: true } & (MemoErrorFunction | Record<string, unknown>) => (
    (typeof value === 'function' || isReferenceLike(value)) &&
    'isError' in value &&
    (value as { isError: unknown }).isError === true
  );

  /**
   * Memoized function.
   */
  const ized = function () {
    const cacheContext: MemoCacheContext = Object.freeze({
      isFuncPromise,
      cacheErrors: isCacheErrors,
      cacheLimit,
      expire: updatedExpire
    });

    const cache = normalizeMemoCache<TReturn>(customCache, { cacheContext, debug });
    let timeout: NodeJS.Timeout | undefined;

    // Take into account map-like objects with partial props
    const getCacheSnapshot = (passed = cache): MemoCache<TReturn> =>
      (passed instanceof Map ? new Map(passed) : new Map(passed.entries()));

    const memoized = (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          if (isOnCacheExpire) {
            const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

            notifyCacheChange({
              all: allCacheEntries,
              remaining: new Map(),
              removed: allCacheEntries,
              handler: onCacheExpire,
              handlerDescription: 'onCacheExpire callback'
            });
          }

          cache.clear();
        }, updatedExpire);

        // Allow the process to exit
        timeout.unref();
      }

      // Zero cacheLimit, reset and bypass memoization
      if (isMemo === false) {
        cache.clear();
        const bypassValue = func.call(null, ...args);

        debug({
          type: 'memo bypass',
          value: () => bypassValue,
          cache: new Map()
        });

        return bypassValue;
      }

      const key = setKey(args);

      // Parse, memoize and return the original value
      if (!cache.has(key)) {
        if (isFuncPromise) {
          const promiseResolve = Promise
            .resolve(func.call(null, ...args))
            .catch((error: unknown) => {
              // Remove the promise
              if (isCacheErrors === false) {
                cache.delete(key);
              }

              return Promise.reject(error);
            });

          // Cache the promise
          cache.set(key, promiseResolve);
        } else {
          try {
            cache.set(key, func.call(null, ...args));
          } catch (error) {
            // Wrap a sync error in a function then cache it
            const errorFunc = () => {
              throw error;
            };

            errorFunc.isError = true;
            cache.set(key, errorFunc);
          }
        }

        // Run callback and cache trim after cache update.
        if (isMemo) {
          if (isOnCacheRollout && typeof cache.size === 'number' && cache.size > cacheLimit) {
            const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

            const temp = Array.from(allCacheEntries.entries());
            const remaining = allCacheEntries.size - cacheLimit;
            // Oldest cache entries
            const removedCacheEntries = temp.slice(0, remaining);

            if (removedCacheEntries.length > 0) {
              // Newest cache entries
              const remainingCacheEntries = temp.slice(remaining);

              notifyCacheChange({
                all: allCacheEntries,
                remaining: new Map(remainingCacheEntries),
                removed: new Map(removedCacheEntries),
                handler: onCacheRollout,
                handlerDescription: 'onCacheRollout callback'
              });
            }
          }

          if (typeof cache.size === 'number') {
            const excess = cache.size - cacheLimit;

            for (let i = 0; i < excess; i++) {
              const oldestKey = cache.keys().next();

              if (oldestKey === undefined || oldestKey.done) {
                break;
              }

              cache.delete(oldestKey.value);
            }
          }
        }
      }

      // Return memoized value
      const cachedValue = cache.get(key);

      if (isMemoError(cachedValue)) {
        if (isCacheErrors === false) {
          cache.delete(key);
        }

        debug({
          type: 'memo error',
          value: cachedValue,
          cache: getCacheSnapshot()
        });

        return typeof cachedValue === 'function' ? cachedValue() : cachedValue;
      }

      debug({
        type: `memo${(isFuncPromise && ' promise') || ''}`,
        value: () => cachedValue,
        cache: getCacheSnapshot()
      });

      return cachedValue as TReturn;
    };

    /**
     * Clear all memoized cache entries.
     *
     * @note `clear` and `onCacheClear` are always called regardless of whether entries are observable.
     *     Map-like adapters (e.g. a persistent store) may expose `clear` without `entries`, so an empty snapshot
     *     does not mean an empty cache. The return value only reports what was observable via `entries`.
     *
     * @returns A `boolean` indicating if observable cache entries were cleared.
     */
    memoized.clear = () => {
      const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

      clearTimeout(timeout);
      timeout = undefined;
      cache.clear();

      debug({
        type: 'memo clear',
        value: undefined,
        cache: getCacheSnapshot()
      });

      notifyCacheChange({
        all: allCacheEntries,
        remaining: new Map(),
        removed: allCacheEntries,
        handler: onCacheClear,
        handlerDescription: 'onCacheClear callback'
      });

      return allCacheEntries.size > 0;
    };

    return memoized;
  };

  return ized();
};

/**
 * Configuration options for `memoUnwrapAdapter`.
 *
 * @property [cacheErrors] Whether to persist error values/rejections to the underlying target store.
 * @property [cacheLimit] Maximum number of entries retained in the in-memory read cache window.
 * @property [expire] Sliding TTL in milliseconds for entries in the in-memory read cache.
 */
interface MemoUnwrapAdapterOptions {
  cacheErrors?: boolean | undefined;
  cacheLimit?: number | undefined;
  expire?: number | undefined;
}

/**
 * Shape persisted to the target store by {@link memoUnwrapAdapter}. Mirrors `Promise.allSettled`.
 *
 * @template V Value type.
 */
type MemoSettled<V> = PromiseSettledResult<V>;

/**
 * Adapter for wrapping a storage backend (Map or {@link MemoMapLike}) to settle values produced by
 * `memo` functions before persisting them to the underlying store as {@link MemoSettled} records.
 *
 * Every value passed to `set()` takes the same path regardless of type: it is staged in-memory as-is,
 * then settled as a promise and persisted to the target store in `Promise.allSettled` form:
 * `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`. Concrete values therefore reach
 * the store one microtask after `set()`; adapter `has()`/`get()` observe them immediately via the staged
 * tier. `memo` sync-error wrappers (`isError`) settle as rejections so sync and async errors persist
 * identically. On hydrated reads the envelope is unwrapped: fulfilled values are returned as-is,
 * rejected entries are rehydrated as a rejecting Promise (async `memo`) or an `isError` wrapper (sync
 * `memo`) so `memo` re-throws them the same way it would in-process.
 *
 * @note **Important**:
 * - The adapter owns the **envelope**, not its contents. Only `status` is ever inspected; `value` and
 *   `reason` are persisted and returned untouched. How a store serializes them (e.g. an `Error` reason)
 *   is the store's responsibility. Entries that are not an envelope (pre-seeded or foreign stores) are
 *   treated as fulfilled raw values.
 *
 * - Persisted `undefined` values at the Map level are indistinguishable from missing entries. A `has`
 *   check is used to distinguish the two. The value is never interpreted by design. **It's on the
 *   consumer to handle consuming these values.**
 *
 * @note Review using `Promise.try` in `settle` once the Node floor is >= 23.
 *
 * @template K Key type.
 * @template V Value type.
 *
 * @param targetStore - Underlying storage backend or a Promise resolving to one.
 * @param [settings] - Configuration options, default fallbacks.
 * @param [settings.cacheErrors] - Persist errors/rejections to the target store. Inherited `memo` context takes
 *     precedence when `true`, otherwise falls back to this setting's default.
 * @param [settings.cacheLimit] - Max entries in the in-memory read window. Inherited `memo` context takes
 *     precedence and falls back to the setting's default.
 * @param [settings.expire] - Sliding expiration in milliseconds. Inherited `memo` context takes precedence
 *     and falls back to the setting's default.
 * @returns A cache factory callback accepting MemoCacheContext and returning a MemoMapLike adapter.
 */
const memoUnwrapAdapter = <K = unknown, V = unknown>(
  targetStore:
    MemoMapLike<K, MemoSettled<V>> |
    Map<K, MemoSettled<V>> |
    Promise<MemoMapLike<K, MemoSettled<V>> | Map<K, MemoSettled<V>>> |
    MemoCacheCallback<V>,
  {
    cacheErrors: settingsCacheErrors = false,
    cacheLimit: settingsCacheLimit = 500,
    expire: settingsExpire = 5 * 60 * 1000
  }: MemoUnwrapAdapterOptions = {}
): MemoCacheCallback<V> => {
  let resolvedStore: MemoMapLike<K, MemoSettled<V>> | undefined;

  const normalizedStore = (rawStore: unknown): MemoMapLike<K, MemoSettled<V>> =>
    normalizeMemoCache<V>(rawStore) as unknown as MemoMapLike<K, MemoSettled<V>>;

  let storeQueue: Promise<unknown> | undefined = isPromise(targetStore)
    ? Promise.resolve(targetStore)
      .then(store => {
        resolvedStore = normalizedStore(store);
      })
      .catch(() => {})
    : undefined;

  if (!isPromise(targetStore)) {
    resolvedStore = normalizedStore(targetStore);
  }

  /**
   * Get the memo cache store.
   */
  const getStore = async (): Promise<MemoMapLike<K, MemoSettled<V>> | undefined> => {
    if (resolvedStore) {
      return resolvedStore;
    }

    if (isPromise(targetStore)) {
      try {
        resolvedStore = normalizedStore(await targetStore);

        return resolvedStore;
      } catch {}
    }

    return undefined;
  };

  /**
   * Update the store either by setting a value, deleting an entry, or clearing the store.
   *
   * @param key - Key to update.
   * @param val - Value to store.
   * @param options - Optional configuration.
   * @param options.isClear - Whether to clear the store.
   * @param options.isDelete - Whether to delete the entry.
   * @param options._resolved - Internal. Has the store resolved? Break the resolve loop.
   * @returns Store update result if synchronous, otherwise undefined.
   */
  const updateStore = (
    key?: K, val?: unknown,
    {
      isClear = false,
      isDelete = false,
      _resolved = false
    }: { isClear?: boolean; isDelete?: boolean; _resolved?: boolean } = {}
  ): unknown => {
    const update = (action: () => unknown) => {
      try {
        const result = action();

        if (isPromise(result)) {
          (result as Promise<unknown>).catch(() => {});
        }

        return result;
      } catch {}

      return undefined;
    };

    const applyUpdate = () => {
      if (!resolvedStore) {
        return undefined;
      }

      if (isClear) {
        return update(() => resolvedStore?.clear?.());
      }

      if (isDelete) {
        return update(() => resolvedStore?.delete?.(key as K));
      }

      return update(() => resolvedStore?.set(key as K, val as MemoSettled<V>));
    };

    if (storeQueue) {
      storeQueue = storeQueue.then(applyUpdate).catch(() => {});

      return undefined;
    }

    if (resolvedStore) {
      return applyUpdate();
    }

    if (!_resolved) {
      getStore()
        .then(() => updateStore(key, val, { isClear, isDelete, _resolved: true }))
        .catch(() => {});
    }

    return undefined;
  };

  /**
   * Set defaults, return an object with map-like methods.
   *
   * @internal
   * @param {MemoCacheContext} context - memo cache context.
   * @returns Object with map-like methods.
   */
  return (context: MemoCacheContext = {}): MemoMapLike<unknown, MemoCacheEntry<V>> => {
    const cacheErrors = context.cacheErrors || settingsCacheErrors;
    const cacheLimit = context.cacheLimit ?? settingsCacheLimit;
    const expire = context.expire ?? settingsExpire;

    // L0: the most recent raw value passed to `set()`, promise or not, until it settles and persists.
    const staged = new Map<K, MemoCacheEntry<V>>();
    const readCache = new Map<unknown, MemoSettled<V> | V | undefined>();

    /**
     * Normalize any cache entry into a promise so every `set()` shares one settle/persist path.
     * `memo` sync-error wrappers (`isError`) are invoked so they settle as rejections.
     *
     * @param value Entry value to settle.
     * @return Promise settling with the unwrapped value, or rejecting with the thrown/rejected reason.
     */
    const settle = (value: MemoCacheEntry<V>): Promise<unknown> => {
      if (isReferenceLike(value) && 'isError' in value && value.isError === true) {
        return new Promise(resolve => {
          resolve((value as () => unknown)());
        });
      }

      return Promise.resolve(value);
    };

    /**
     * Is the entry an adapter envelope? Only `status` is checked, never the payload.
     *
     * @param entry Entry read from the store.
     * @return True if the entry is a `PromiseSettledResult`.
     */
    const isSettled = (entry: unknown): entry is MemoSettled<V> =>
      isReferenceLike(entry) &&
      'status' in entry &&
      ((entry as { status: unknown }).status === 'fulfilled' || (entry as { status: unknown }).status === 'rejected');

    /**
     * Unwrap a stored entry into the form `memo` expects. Non-envelope entries are returned as-is.
     * Rejections are rehydrated per `context.isFuncPromise` so `memo` re-throws them normally.
     *
     * @param entry Entry read from the store or read window.
     * @return A memo cache entry.
     */
    const unwrap = (entry: unknown): MemoCacheEntry<V> | undefined => {
      if (!isSettled(entry)) {
        return entry as MemoCacheEntry<V>;
      }

      if (entry.status === 'fulfilled') {
        return entry.value;
      }

      if (context.isFuncPromise) {
        const rejected = Promise.reject(entry.reason);

        // Suppress unhandled-rejection noise until memo hands it to the caller.
        rejected.catch(() => {});

        return rejected as MemoCacheEntry<V>;
      }

      const errorFunc = () => {
        throw entry.reason;
      };

      errorFunc.isError = true;

      return errorFunc as unknown as MemoCacheEntry<V>;
    };

    /**
     * Does the key exist? Faults and pending are considered `false`.
     *
     * @param key Entry key to check.
     * @return True if the resolved store has the key.
     */
    const storeHas = (key: K): boolean => {
      try {
        return Boolean(resolvedStore?.has(key));
      } catch {}

      return false;
    };

    /**
     * Get a raw (still enveloped) entry from the resolved store.
     *
     * @param key Entry key to get.
     * @return Entry from the resolved store.
     */
    const memoizedGet = memo(
      (key: K): MemoSettled<V> | V | undefined => {
        try {
          return resolvedStore?.get(key) as MemoSettled<V> | V | undefined;
        } catch {}

        return undefined;
      },
      {
        cache: readCache,
        cacheLimit,
        expire,
        keyHash: args => args[0] as string
      }
    );

    return {

      /**
       * Clear the cache.
       *
       * @return Confirm the cache was cleared.
       */
      clear(): unknown {
        staged.clear();
        memoizedGet.clear();

        return updateStore(undefined, undefined, { isClear: true });
      },

      /**
       * Delete an entry from the cache.
       *
       * @note Returned boolean reflects what was observable at call time. Staged entries, the read
       *     window, and the resolved target store. A pending target store has no observable entries,
       *     ergo `false` is returned.
       *
       * @param key Entry key to delete.
       * @return Confirm the entry was deleted.
       */
      delete(key: K): boolean {
        const existed = staged.has(key) || readCache.has(key) || storeHas(key);

        staged.delete(key);
        readCache.delete(key);

        updateStore(key, undefined, { isDelete: true });

        return existed;
      },

      /**
       * Return an iterator of entries in the cache.
       *
       * @note Entries are unwrapped; the read window itself holds the persisted envelopes.
       *
       * @return An iterable iterator of tuples containing each cache key and value.
       */
      entries(): IterableIterator<[K, MemoCacheEntry<V>]> {
        return Array.from((readCache as Map<K, unknown>).entries())
          .map(([key, entry]) => [key, unwrap(entry)] as [K, MemoCacheEntry<V>])
          .values();
      },

      /**
       * Retrieve a cache entry.
       *
       * @param key The key used to look up the memoized cache entry.
       * @return The matching memoized cache entry, or `undefined` if no entry exists.
       */
      get(key: K): MemoCacheEntry<V> | undefined {
        if (staged.has(key)) {
          return staged.get(key);
        }

        if (readCache.has(key) || storeHas(key)) {
          return unwrap(memoizedGet(key));
        }

        return undefined;
      },

      /**
       * Does the key exist?
       *
       * @param key Entry key to check.
       * @return True if the key exists.
       */
      has(key: K): boolean {
        return staged.has(key) || readCache.has(key) || storeHas(key);
      },

      /**
       * Return an iterator of keys in the cache.
       *
       * @return An iterable iterator of keys.
       */
      keys(): IterableIterator<K> {
        return (readCache as Map<K, MemoCacheEntry<V>>).keys();
      },

      /**
       * Set an entry in the cache.
       *
       * @note Mirrors `Map.set` used by `memo`. Every set overwrites the current entry for `key`.
       *     `memo` determines the `has()` check, this adapter **SHOULD NOT** add its own.
       *
       * @note All values take the same path: staged as-is so `get()` returns exactly what was set,
       *     then settled and persisted asynchronously as a `PromiseSettledResult`. Concrete values
       *     reach the target store one microtask after `set()`. A superseded entry's late settlement
       *     is ignored. Rejections are persisted only when `cacheErrors` is enabled, otherwise deleted.
       *
       * @param key Entry key to set.
       * @param value Entry value to set.
       * @return The current cache instance.
       */
      set(key: K, value: MemoCacheEntry<V>): unknown {
        readCache.delete(key);
        staged.set(key, value);

        settle(value)
          .then(
            (resolvedValue): MemoSettled<V> => ({ status: 'fulfilled', value: resolvedValue as V }),
            (reason: unknown): MemoSettled<V> => ({ status: 'rejected', reason })
          )
          .then(settled => {
            if (staged.get(key) !== value) {
              return;
            }

            staged.delete(key);

            if (settled.status === 'rejected' && !cacheErrors) {
              updateStore(key, undefined, { isDelete: true });
            } else {
              updateStore(key, settled);
            }
          });

        return this;
      },

      /**
       * Returns the number of entries in the cache.
       */
      get size(): number {
        return readCache.size;
      }
    } as unknown as MemoMapLike<unknown, MemoCacheEntry<V>>;
  };
};

export {
  isMapLike,
  memo,
  memoUnwrapAdapter,
  normalizeMemoCache,
  normalizeMapLike,
  type MemoCacheCallback,
  type MemoCacheContext,
  type MemoUnwrapAdapterOptions,
  type MemoMapLike,
  type MemoCacheHandlerResponse,
  type MemoDebugHandler,
  type MemoCache,
  type MemoCacheEntry,
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type OnMemoCacheHandler
};

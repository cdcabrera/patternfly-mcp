import {
  isPromise,
  isReferenceLike
} from './server.helpers';
import {
  isMemoError,
  memo,
  normalizeMemoCache,
  type MemoCacheCallback,
  type MemoCacheContext,
  type MemoMapLike,
  type MemoCacheHandlerResponse,
  type MemoDebugHandler,
  type MemoCache,
  type MemoCacheEntry,
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type OnMemoCacheHandler
} from './server.caching';

/**
 * Configuration options for {@link memoSettledAdapter}.
 *
 * @property [cacheErrors] Whether to persist error values/rejections to the underlying target store.
 * @property [cacheLimit] Maximum number of entries retained in the in-memory read cache.
 * @property [expire] Sliding TTL in milliseconds for entries in the in-memory read cache.
 */
interface MemoSettledAdapterOptions {
  cacheErrors?: boolean | undefined;
  cacheLimit?: number | undefined;
  expire?: number | undefined;
}

/**
 * Shape submitted to the target store by {@link memoSettledAdapter}. Parallel to `Promise.allSettled` responses.
 *
 * @template V Value type.
 */
type MemoSettled<V> = PromiseSettledResult<V>;

/**
 * `memo` cache adapter for settling values before being passed to an external store (Map or {@link MemoMapLike}).
 *
 * @note **Behavior**
 * - The adapter is a pass-through for memoized content. It leverages the format used by `Promise.allSettled`
 *   responses to allow storing of both errors and fulfillment in a standard way.
 *
 * - Entries that are not Promises are normalized and treated as "settled" fulfilled, or rejected, raw values.
 *
 * - On hydrated reads back to memo, the "settled" wrapper is unwrapped.
 *     - Fulfilled values are returned as-is,
 *     - Rejected values are rehydrated as either a rejecting Promise (async `memo`) or as an `isError` wrapper
 *       (sync `memo`) so `memo` re-throws them the same way it would in-process.
 *
 * **Important**:
 * - The "settled" `status` is the only property inspected. How a store serializes the "settled" results
 *   is the store's responsibility.
 *
 * - Persisted `undefined` values at the Map level are indistinguishable from missing entries. A `has`
 *   check is used to distinguish the two. The value is never interpreted by design. **It's on the
 *   consumer to handle consuming values passed by their own memoized functionality.**
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
 * @param [settings.cacheLimit] - Max entries in the in-memory read cache. Inherited `memo` context takes
 *     precedence and falls back to the setting's default.
 * @param [settings.expire] - Sliding expiration in milliseconds. Inherited `memo` context takes precedence
 *     and falls back to the setting's default.
 * @returns A cache factory callback accepting MemoCacheContext and returning a MemoMapLike adapter.
 */
const memoSettledAdapter = <K = unknown, V = unknown>(
  targetStore:
    MemoMapLike<K, MemoSettled<V>> |
    Map<K, MemoSettled<V>> |
    Promise<MemoMapLike<K, MemoSettled<V>> | Map<K, MemoSettled<V>>> |
    MemoCacheCallback<V>,
  {
    cacheErrors: settingsCacheErrors = false,
    cacheLimit: settingsCacheLimit = 500,
    expire: settingsExpire = 5 * 60 * 1000
  }: MemoSettledAdapterOptions = {}
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

    // Most recent value passed to `set()`, paired with a write-token until it settles and persists.
    const staged = new Map<K, { token: symbol; value: MemoCacheEntry<V> }>();
    const readCache = new Map<unknown, MemoSettled<V> | V | undefined>();

    /**
     * Normalize every cache entry into a promise so every `set()` shares one settle path.
     * `memo` sync-error wrappers (`isError`) are invoked so they settle as rejections.
     *
     * @param value Entry value to settle.
     * @return Promise settling with the unwrapped value, or rejecting with the thrown/rejected reason.
     */
    const settle = (value: MemoCacheEntry<V>): Promise<unknown> => {
      if (isMemoError(value)) {
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
     * Hydrate a stored entry into the `memo` format.
     *
     * - Entries without wrappers are returned as-is.
     * - Rejections are rehydrated per `context.isFuncPromise` so `memo` re-throws normally.
     *
     * @param entry Entry to hydrate.
     * @return A memo cache entry.
     */
    const hydrateMemo = (entry: unknown): MemoCacheEntry<V> | undefined => {
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
     * Get an entry from the resolved store.
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
       *     cache, and the resolved target store. A pending target store has no observable entries,
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
       * @note Entries are unwrapped; the read cache itself holds the persisted envelopes.
       *
       * @return An iterable iterator of tuples containing each cache key and value.
       */
      entries(): IterableIterator<[K, MemoCacheEntry<V>]> {
        return Array.from((readCache as Map<K, unknown>).entries())
          .map(([key, entry]) => [key, hydrateMemo(entry)] as [K, MemoCacheEntry<V>])
          .values();
      },

      /**
       * Retrieve a cache entry.
       *
       * @param key The key used to look up the memoized cache entry.
       * @return The matching memoized cache entry, or `undefined` if no entry exists.
       */
      get(key: K): MemoCacheEntry<V> | undefined {
        const stagedEntry = staged.get(key);

        if (stagedEntry) {
          return stagedEntry.value;
        }

        if (readCache.has(key) || storeHas(key)) {
          return hydrateMemo(memoizedGet(key));
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
        const token = Symbol();

        readCache.delete(key);
        staged.set(key, { token, value });

        settle(value)
          .then(
            (resolvedValue): MemoSettled<V> => ({ status: 'fulfilled', value: resolvedValue as V }),
            (reason: unknown): MemoSettled<V> => ({ status: 'rejected', reason })
          )
          .then(settled => {
            if (staged.get(key)?.token !== token) {
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
  memoSettledAdapter,
  type MemoCacheCallback,
  type MemoCacheContext,
  type MemoSettledAdapterOptions,
  type MemoMapLike,
  type MemoCacheHandlerResponse,
  type MemoDebugHandler,
  type MemoCache,
  type MemoCacheEntry,
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type MemoSettled,
  type OnMemoCacheHandler
};

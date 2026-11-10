import { memo } from '../server.caching';
import { memoSettledAdapter } from '../server.cachingAdapter';

describe('memoSettledAdapter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'concrete value',
      value: 'sync-val',
      expected: 'sync-val'
    },
    {
      description: 'resolved promise value',
      value: Promise.resolve('async-val'),
      expected: 'async-val'
    },
    {
      description: 'undefined value',
      value: Promise.resolve(undefined),
      expected: undefined
    },
    {
      description: 'falsy empty string',
      value: '',
      expected: ''
    }
  ])('should unwrap and persist $description to targetStore', async ({ value, expected }) => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore)();

    cache.set('key', value);
    // Immediate read returns the staged entry as-is
    expect(cache.get('key')).toBe(value);

    if (value instanceof Promise) {
      await value;
    }
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('key')).toBe(true);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: expected });
    expect(cache.get('key')).toBe(expected);
  });

  it.each([
    {
      description: 'persist error when cacheErrors is true',
      cacheErrors: true,
      expectedHas: true
    },
    {
      description: 'delete entry when cacheErrors is false',
      cacheErrors: false,
      expectedHas: false
    }
  ])('should $description when an in-flight promise rejects', async ({ cacheErrors, expectedHas }) => {
    const targetStore = new Map([['key', 'stale-val']]);
    const cache = memoSettledAdapter(targetStore as never, { cacheErrors })();
    const error = new Error('boom');
    const rejectingPromise = Promise.reject(error);

    cache.set('key', rejectingPromise);
    expect(cache.has('key')).toBe(true);
    expect(cache.get('key')).toBe(rejectingPromise);

    await expect(rejectingPromise).rejects.toThrow('boom');
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('key')).toBe(expectedHas);
    if (cacheErrors) {
      expect(targetStore.get('key')).toEqual({ status: 'rejected', reason: error });
    }
  });

  it('should ignore a superseded in-flight promise when a concrete value replaces the same key', async () => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore)();

    let resolveOld: (value: string) => void = () => {};
    const oldPromise = new Promise<string>(resolve => {
      resolveOld = resolve;
    });

    // Pending promise, then a concrete write to the same key
    cache.set('key', oldPromise);
    expect(cache.get('key')).toBe(oldPromise);

    cache.set('key', 'newer');

    // Newer value is immediately visible and persists after settlement
    expect(cache.get('key')).toBe('newer');
    await jest.advanceTimersByTimeAsync(0);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });

    // Late settlement of the superseded promise must NOT "clobber" the newer value
    resolveOld('older');
    await oldPromise;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });
    expect(cache.get('key')).toBe('newer');
  });

  it.each([
    {
      description: 'not delete the newer value when cacheErrors is false',
      cacheErrors: false
    },
    {
      description: 'not overwrite the newer value with the error when cacheErrors is true',
      cacheErrors: true
    }
  ])('should $description if a superseded in-flight promise rejects', async ({ cacheErrors }) => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore, { cacheErrors })();

    let rejectOld: (reason: unknown) => void = () => {};
    const oldPromise = new Promise<string>((_resolve, reject) => {
      rejectOld = reject;
    });

    cache.set('key', oldPromise);
    cache.set('key', 'newer');

    expect(cache.get('key')).toBe('newer');
    await jest.advanceTimersByTimeAsync(0);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });

    rejectOld(new Error('boom'));
    await expect(oldPromise).rejects.toThrow('boom');
    await jest.advanceTimersByTimeAsync(0);

    // Superseded rejection must not delete or overwrite the newer entry
    expect(targetStore.has('key')).toBe(true);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });
    expect(cache.get('key')).toBe('newer');
  });

  it('should ignore a superseded in-flight promise when a newer promise replaces the same key', async () => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore)();

    let resolveOld: (value: string) => void = () => {};
    const oldPromise = new Promise<string>(resolve => {
      resolveOld = resolve;
    });
    const newPromise = Promise.resolve('newer');

    cache.set('key', oldPromise);
    cache.set('key', newPromise);
    expect(cache.get('key')).toBe(newPromise);

    await newPromise;
    await jest.advanceTimersByTimeAsync(0);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });

    resolveOld('older');
    await oldPromise;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });
    expect(cache.get('key')).toBe('newer');
  });

  it('should report existence from any tier on delete and ignore a deleted in-flight promise on settlement', async () => {
    const targetStore = new Map([['l2-only', 'persisted']]);
    const cache = memoSettledAdapter(targetStore as never)();

    // Unknown key, nothing observable
    expect(cache.delete?.('missing')).toBe(false);

    // Entry only in target store
    expect(cache.delete?.('l2-only')).toBe(true);
    expect(cache.has('l2-only')).toBe(false);
    expect(targetStore.has('l2-only')).toBe(false);

    // Hydrated entry
    targetStore.set('hydrated', 'val');
    expect(cache.get('hydrated')).toBe('val');
    expect(cache.size).toBe(1);
    expect(cache.delete?.('hydrated')).toBe(true);
    expect(cache.size).toBe(0);
    expect(targetStore.has('hydrated')).toBe(false);

    // Staged entry: delete returns true and late settlement does not restore it
    let resolvePending: (value: string) => void = () => {};
    const pending = new Promise<string>(resolve => {
      resolvePending = resolve;
    });

    cache.set('in-flight', pending);
    expect(cache.delete?.('in-flight')).toBe(true);
    expect(cache.has('in-flight')).toBe(false);

    resolvePending('late');
    await pending;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('in-flight')).toBe(false);
    expect(cache.has('in-flight')).toBe(false);
  });

  it('should return false from delete while the targetStore is pending but still queue the delete', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const targetStore = new Map([['existing', 'val']]);
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });
    const cache = memoSettledAdapter(storePromise as never)();

    // Store is not observable while pending
    expect(cache.has('existing')).toBe(false);
    expect(cache.delete?.('existing')).toBe(false);

    resolveStore?.(targetStore);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    // Queued delete is applied once the store resolves
    expect(targetStore.has('existing')).toBe(false);
  });

  it('should not throw from delete, has, or get when the targetStore has method faults', () => {
    const faultyStore = {
      has: () => {
        throw new Error('has failed');
      },
      get: () => undefined,
      set: () => undefined,
      delete: () => true,
      clear: () => undefined
    };
    const cache = memoSettledAdapter(faultyStore as never)();

    expect(() => cache.has('key')).not.toThrow();
    expect(cache.has('key')).toBe(false);
    expect(() => cache.get('key')).not.toThrow();
    expect(cache.get('key')).toBeUndefined();
    expect(() => cache.delete?.('key')).not.toThrow();
    expect(cache.delete?.('key')).toBe(false);
  });

  it.each([
    {
      description: 'persist the thrown reason when cacheErrors is true',
      cacheErrors: true,
      expectedHas: true
    },
    {
      description: 'delete the entry when cacheErrors is false',
      cacheErrors: false,
      expectedHas: false
    }
  ])('should $description for a memo sync-error wrapper, matching rejections', async ({ cacheErrors, expectedHas }) => {
    const targetStore = new Map([['key', 'stale-val']]);
    const cache = memoSettledAdapter(targetStore as never, { cacheErrors })();
    const error = new Error('sync boom');
    const errorFunc = Object.assign(() => {
      throw error;
    }, { isError: true });

    cache.set('key', errorFunc);

    // Immediate read returns the error wrapper as-is
    expect(cache.get('key')).toBe(errorFunc);

    await jest.advanceTimersByTimeAsync(0);

    // The wrapper function itself is not persisted to the store
    expect(targetStore.has('key')).toBe(expectedHas);
    expect(typeof targetStore.get('key')).not.toBe('function');
    if (cacheErrors) {
      expect(targetStore.get('key')).toEqual({ status: 'rejected', reason: error });
    }
  });

  it('should return a sync memoized value while the targetStore is pending and persist once resolved', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });
    const mockFunc = jest.fn((val: number) => val * 2);
    const memoized = memo(mockFunc, { cache: memoSettledAdapter(storePromise as never) });

    // Returns the memoized value while the store is pending
    expect(memoized(2)).toBe(4);
    expect(memoized(2)).toBe(4);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    const store = new Map();

    resolveStore?.(store);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    // Queued write landed once the store resolved
    expect(Array.from(store.values())).toEqual([{ status: 'fulfilled', value: 4 }]);
    expect(memoized(2)).toBe(4);

    // A rejected store never resolves, but the sync value is still returned
    const rejected = Promise.reject(new Error('no db'));
    const failed = memo((val: number) => val + 1, { cache: memoSettledAdapter(rejected) });

    await expect(rejected).rejects.toThrow('no db');
    await jest.advanceTimersByTimeAsync(0);

    expect(failed(1)).toBe(2);
  });

  it.each([
    { description: 'undefined', value: undefined },
    { description: 'NaN', value: Number.NaN },
    { description: 'null', value: null },
    { description: 'false', value: false },
    { description: 'zero', value: 0 },
    { description: 'negative zero', value: -0 },
    { description: 'empty string', value: '' },
    { description: 'symbol', value: Symbol('unique') }
  ])('should persist $description on settlement, and not persist if memo clears before settlement', async ({ value }) => {
    const clearedStore = new Map();
    const clearedMemo = memo(() => value, { cache: memoSettledAdapter(clearedStore) });

    expect(Object.is(clearedMemo(), value)).toBe(true);
    clearedMemo.clear();

    await jest.advanceTimersByTimeAsync(0);

    expect(clearedStore.size).toBe(0);

    const settledStore = new Map();
    const settledMemo = memo(() => value, { cache: memoSettledAdapter(settledStore) });

    expect(Object.is(settledMemo(), value)).toBe(true);
    await jest.advanceTimersByTimeAsync(0);

    expect(settledStore.size).toBe(1);
    expect(Array.from(settledStore.values())).toEqual([{ status: 'fulfilled', value }]);
  });

  it('should hydrate readCache from targetStore on get and expose active window via size, keys, and entries', () => {
    const targetStore = new Map([
      ['k1', 'v1'],
      ['k2', 'v2']
    ]);
    const cache = memoSettledAdapter(targetStore as never)();

    // Before hydration, readCache window is empty even though targetStore has entries
    expect(cache.size).toBe(0);
    expect(cache.has('k1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
    expect(cache.get('missing')).toBeUndefined();

    // Accessing k1 hydrates only k1 into the readCache window
    expect(cache.get('k1')).toBe('v1');
    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys?.() || [])).toEqual(['k1']);
    expect(Array.from(cache.entries?.() || [])).toEqual([['k1', 'v1']]);
  });

  it('should surgically evict keys from readCache on set and delete, and clear all tiers on clear', async () => {
    const targetStore = new Map([
      ['k1', 'v1'],
      ['k2', 'v2']
    ]);
    const cache = memoSettledAdapter(targetStore as never)();

    // Hydrate both keys into readCache
    expect(cache.get('k1')).toBe('v1');
    expect(cache.get('k2')).toBe('v2');
    expect(cache.size).toBe(2);

    // Updating k1 evicts k1 from readCache without disturbing k2, and updates targetStore
    cache.set('k1', 'v1-updated');
    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys?.() || [])).toEqual(['k2']);
    await jest.advanceTimersByTimeAsync(0);
    expect(targetStore.get('k1')).toEqual({ status: 'fulfilled', value: 'v1-updated' });

    // Deleting k2 removes it from readCache and targetStore
    expect(cache.delete?.('k2')).toBe(true);
    expect(cache.has('k2')).toBe(false);
    expect(targetStore.has('k2')).toBe(false);

    // Clearing empties all cache layers and target store
    expect(cache.get('k1')).toBe('v1-updated');
    expect(cache.size).toBe(1);
    cache.clear?.();
    expect(cache.size).toBe(0);
    expect(targetStore.size).toBe(0);

    // In-flight promises cleared before settling do not persist stale values
    let resolveStale: ((val: string) => void) | undefined;
    const stalePromise = new Promise<string>(resolve => {
      resolveStale = resolve;
    });

    cache.set('stale-in-flight', stalePromise);
    cache.clear?.();
    resolveStale?.('stale-val');
    await stalePromise;
    expect(targetStore.has('stale-in-flight')).toBe(false);
  });

  it('should queue writes for a pending Promise targetStore and flush once resolved', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const targetStore = new Map([['existing', 'val']]);
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });

    const cache = memoSettledAdapter(storePromise as never)();

    cache.set('cleared-key', 'stale-val');
    cache.clear?.();
    cache.set('existing', 'restored-val');
    cache.set('queued-set', 'queued-val');
    cache.delete?.('existing');

    resolveStore?.(targetStore);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('cleared-key')).toBe(false);
    expect(targetStore.get('queued-set')).toEqual({ status: 'fulfilled', value: 'queued-val' });
    expect(targetStore.has('existing')).toBe(false);
  });

  it('should gracefully handle a rejecting Promise targetStore and faulty store methods', async () => {
    const rejectingStore = Promise.reject(new Error('store init failed'));
    const asyncCache = memoSettledAdapter(rejectingStore)({});

    asyncCache.set('k', 'v');
    await jest.advanceTimersByTimeAsync(0);
    expect(asyncCache.get('k')).toBeUndefined();

    const faultyStore = {
      has: () => true,
      get: () => {
        throw new Error('sync get error');
      },
      set: () => Promise.reject(new Error('async set error')),
      delete: () => {
        throw new Error('sync delete error');
      },
      clear: () => {
        throw new Error('sync clear error');
      }
    };

    const faultyCache = memoSettledAdapter(faultyStore)();

    expect(faultyCache.get('k')).toBeUndefined();
    expect(() => faultyCache.set('k', 'v' as any)).not.toThrow();
    expect(() => faultyCache.delete?.('k')).not.toThrow();
    expect(faultyCache.clear?.()).toBeUndefined();
  });

  it.each([
    {
      description: 'resolved Error value',
      func: async () => new Error('lorem ipsum'),
      rejects: false
    },
    {
      description: 'rejected Error reason',
      func: async () => {
        throw new Error('lorem ipsum');
      },
      rejects: true
    }
  ])('should persist a $description as a settled record and rehydrate it faithfully', async ({ func, rejects }) => {
    const targetStore = new Map();
    const mockFunc = jest.fn(func);
    const myMemoFunc = memo(mockFunc, { cache: memoSettledAdapter(targetStore, { cacheErrors: true }) });

    const call = async () => {
      try {
        return { value: await myMemoFunc(), caught: undefined };
      } catch (caught) {
        return { value: undefined, caught };
      }
    };

    // First call, in-flight: memo's own semantics apply (resolve vs. reject).
    const first = await call();

    expect(first.caught instanceof Error).toBe(rejects);
    expect(first.value instanceof Error).toBe(!rejects);

    // The store receives a settled record; only status distinguishes the two.
    await jest.advanceTimersByTimeAsync(0);
    expect(targetStore.size).toBe(1);
    const [record] = Array.from(targetStore.values()) as PromiseSettledResult<unknown>[];

    expect(record?.status).toBe(rejects ? 'rejected' : 'fulfilled');
    expect(record?.status === 'rejected' ? record.reason : record?.value).toBeInstanceOf(Error);

    // Second call, hydrated from targetStore: a rejection is still a rejection, a value is still a value.
    const second = await call();

    expect(second.caught instanceof Error).toBe(rejects);
    expect(second.value instanceof Error).toBe(!rejects);
    expect(((second.caught ?? second.value) as Error).message).toBe('lorem ipsum');

    // The underlying function was NOT re-invoked; the value came from the store.
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should rehydrate a persisted rejection as an isError wrapper for a sync memo function', () => {
    const error = new Error('sync boom');
    const targetStore = new Map([['key', { status: 'rejected', reason: error }]]);
    const cache = memoSettledAdapter(targetStore as never)({ isFuncPromise: false });

    const entry = cache.get('key') as { isError?: boolean } & (() => unknown);

    expect(typeof entry).toBe('function');
    expect(entry.isError).toBe(true);
    expect(() => entry()).toThrow('sync boom');
  });

  it('should pass through non-envelope entries from a pre-seeded store as fulfilled values', () => {
    const targetStore = new Map<string, unknown>([
      ['raw', 'legacy'],
      ['wrapped', { status: 'fulfilled', value: 'new' }]
    ]);
    const cache = memoSettledAdapter(targetStore as never)();

    expect(cache.get('raw')).toBe('legacy');
    expect(cache.get('wrapped')).toBe('new');
    expect(Array.from(cache.entries?.() || [])).toEqual([['raw', 'legacy'], ['wrapped', 'new']]);
  });
});

import { DatabaseSync } from 'node:sqlite';
import { createDbMemoStore, initMemoCacheTable } from '../server.dbMemoStore';
import type { MemoSettled } from '../server.cachingAdapter';

describe('initMemoCacheTable', () => {
  it('should idempotently create the memo_cache table and indices', () => {
    const rawDb = new DatabaseSync(':memory:');

    initMemoCacheTable(rawDb);
    initMemoCacheTable(rawDb);

    const tableInfo = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memo_cache'")
      .get() as { name: string } | undefined;

    expect(tableInfo?.name).toBe('memo_cache');
    rawDb.close();
  });
});

describe('createDbMemoStore', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should set, has, and get entries within a namespace', () => {
    const store = createDbMemoStore<string>(db, 'ns_test');
    const entry: MemoSettled<string> = { status: 'fulfilled', value: 'hello' };

    expect(store.has('key1')).toBe(false);
    expect(store.get('key1')).toBeUndefined();

    store.set('key1', entry);

    expect(store.has('key1')).toBe(true);
    expect(store.get('key1')).toEqual(entry);
    expect(store.size).toBe(1);
  });

  it('should update existing entries and track access count', () => {
    const store = createDbMemoStore<number>(db, 'ns_test');

    store.set('count', { status: 'fulfilled', value: 1 });

    const firstGet = store.get('count');

    expect(firstGet).toEqual({ status: 'fulfilled', value: 1 });

    store.set('count', { status: 'fulfilled', value: 2 });
    const secondGet = store.get('count');

    expect(secondGet).toEqual({ status: 'fulfilled', value: 2 });

    const row = db
      .prepare('SELECT access_count FROM memo_cache WHERE namespace = ? AND key_hash = ?')
      .get('ns_test', 'count') as { access_count: number };

    expect(row.access_count).toBeGreaterThanOrEqual(2);
  });

  it('should delete entries and return boolean status', () => {
    const store = createDbMemoStore<string>(db, 'ns_test');

    store.set('key1', { status: 'fulfilled', value: 'val1' });

    expect(store.has('key1')).toBe(true);
    const deleted = store.delete?.('key1');

    expect(deleted).toBe(true);
    expect(store.has('key1')).toBe(false);
    expect(store.get('key1')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('should hash object keys deterministically', () => {
    const store = createDbMemoStore<string>(db, 'ns_test');
    const keyA = { url: 'https://example.com', method: 'GET' };
    const keyB = { method: 'GET', url: 'https://example.com' };

    store.set(keyA, { status: 'fulfilled', value: 'cached' });

    expect(store.has(keyB)).toBe(true);
    expect(store.get(keyB)).toEqual({ status: 'fulfilled', value: 'cached' });
  });

  it('should isolate keys between namespaces and preserve other namespaces on clear', () => {
    const storeA = createDbMemoStore<string>(db, 'ns_a');
    const storeB = createDbMemoStore<string>(db, 'ns_b');

    storeA.set('shared_key', { status: 'fulfilled', value: 'val_a' });
    storeB.set('shared_key', { status: 'fulfilled', value: 'val_b' });

    expect(storeA.get('shared_key')).toEqual({ status: 'fulfilled', value: 'val_a' });
    expect(storeB.get('shared_key')).toEqual({ status: 'fulfilled', value: 'val_b' });
    expect(storeA.size).toBe(1);
    expect(storeB.size).toBe(1);

    storeA.clear?.();

    expect(storeA.has('shared_key')).toBe(false);
    expect(storeA.get('shared_key')).toBeUndefined();
    expect(storeA.size).toBe(0);

    expect(storeB.has('shared_key')).toBe(true);
    expect(storeB.get('shared_key')).toEqual({ status: 'fulfilled', value: 'val_b' });
    expect(storeB.size).toBe(1);
  });

  it('should expire entries when ttl has elapsed', () => {
    jest.useFakeTimers();
    const now = 100000;

    jest.setSystemTime(now);

    const store = createDbMemoStore<string>(db, 'ns_ttl', { ttl: 5000 });

    store.set('temp', { status: 'fulfilled', value: 'expires_soon' });

    expect(store.has('temp')).toBe(true);
    expect(store.get('temp')).toEqual({ status: 'fulfilled', value: 'expires_soon' });
    expect(store.size).toBe(1);

    jest.setSystemTime(now + 5001);

    expect(store.has('temp')).toBe(false);
    expect(store.get('temp')).toBeUndefined();
    expect(store.size).toBe(0);

    jest.useRealTimers();
  });

  it('should iterate over keys and entries filtering expired items', () => {
    const store = createDbMemoStore<string>(db, 'ns_iter');

    store.set('k1', { status: 'fulfilled', value: 'v1' });
    store.set('k2', { status: 'fulfilled', value: 'v2' });

    const keys = Array.from(store.keys?.() ?? []);

    expect(keys).toEqual(['k1', 'k2']);

    const entries = Array.from(store.entries?.() ?? []);

    expect(entries).toEqual([
      ['k1', { status: 'fulfilled', value: 'v1' }],
      ['k2', { status: 'fulfilled', value: 'v2' }]
    ]);
  });

  it('should persist rejected error envelopes', () => {
    const store = createDbMemoStore<never>(db, 'ns_err');
    const errorEntry: MemoSettled<never> = {
      status: 'rejected',
      reason: new Error('Network timeout'),
      isPromise: true
    };

    store.set('failed_call', errorEntry);

    const retrieved = store.get('failed_call');

    expect(retrieved).toEqual(expect.objectContaining({
      status: 'rejected',
      isPromise: true
    }));
  });

  it('should safely evict corrupted JSON entries upon get', () => {
    const store = createDbMemoStore<string>(db, 'ns_corrupt');

    store.set('bad', { status: 'fulfilled', value: 'ok' });

    db.prepare('UPDATE memo_cache SET value = ? WHERE namespace = ? AND key_hash = ?')
      .run('{ invalid json', 'ns_corrupt', 'bad');

    expect(store.get('bad')).toBeUndefined();
    expect(store.has('bad')).toBe(false);
  });
});

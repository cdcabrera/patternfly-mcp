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

  it('should purge entries that expired while the server was offline on initialization', () => {
    const rawDb = new DatabaseSync(':memory:');

    initMemoCacheTable(rawDb);

    // Manually insert an expired row simulating a previous session
    rawDb.prepare(`
      INSERT INTO memo_cache (namespace, key_hash, value, status, created_at, expires_at, last_accessed_at)
      VALUES ('ns_offline', 'k_old', '{"status":"fulfilled","value":"stale"}', 'fulfilled', 1000, 2000, 1000)
    `).run();

    initMemoCacheTable(rawDb);

    const row = rawDb.prepare('SELECT 1 FROM memo_cache WHERE namespace = ? AND key_hash = ?').get('ns_offline', 'k_old');

    expect(row).toBeUndefined();
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

    (storeA.clear as (all?: boolean) => void)?.(true);

    expect(storeA.has('shared_key')).toBe(false);
    expect(storeA.get('shared_key')).toBeUndefined();
    expect(storeA.size).toBe(0);

    expect(storeB.has('shared_key')).toBe(true);
    expect(storeB.get('shared_key')).toEqual({ status: 'fulfilled', value: 'val_b' });
    expect(storeB.size).toBe(1);
  });

  it('should expire entries when expire time has elapsed', () => {
    jest.useFakeTimers();
    const now = 100000;

    jest.setSystemTime(now);

    const store = createDbMemoStore<string>(db, 'ns_expire', { expire: 5000 });

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

  it('should interpret clear() as TTL garbage collection of expired entries while preserving active ones', () => {
    jest.useFakeTimers();
    const now = 200000;

    jest.setSystemTime(now);

    const store = createDbMemoStore<string>(db, 'ns_gc', { expire: 5000 });

    store.set('expired_key', { status: 'fulfilled', value: 'old_value' });

    jest.setSystemTime(now + 6000);
    store.set('fresh_key', { status: 'fulfilled', value: 'fresh_value' });

    // Default clear() performs TTL garbage collection
    store.clear?.();

    // Fresh key must still be present and valid
    expect(store.has('fresh_key')).toBe(true);
    expect(store.get('fresh_key')).toEqual({ status: 'fulfilled', value: 'fresh_value' });

    // Expired row has been physically deleted from the table
    const expiredRow = db.prepare('SELECT 1 FROM memo_cache WHERE namespace = ? AND key_hash = ?').get('ns_gc', 'expired_key');

    expect(expiredRow).toBeUndefined();

    jest.useRealTimers();
  });

  it('should perform opportunistic TTL pruning on set when prune interval has elapsed', () => {
    jest.useFakeTimers();
    const now = 300000;

    jest.setSystemTime(now);

    const store = createDbMemoStore<string>(db, 'ns_opp_gc', { expire: 5000, pruneIntervalMs: 10000 });

    store.set('first_key', { status: 'fulfilled', value: 'v1' });

    // Advance time past expiration AND prune interval
    jest.setSystemTime(now + 12000);
    store.set('second_key', { status: 'fulfilled', value: 'v2' });

    const staleRow = db.prepare('SELECT 1 FROM memo_cache WHERE namespace = ? AND key_hash = ?').get('ns_opp_gc', 'first_key');

    expect(staleRow).toBeUndefined();

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

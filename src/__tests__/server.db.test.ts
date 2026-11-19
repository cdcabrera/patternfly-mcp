import { createDb, type DbInstance } from '../server.db';

describe('createDb', () => {
  let dbInstance: DbInstance;

  beforeEach(() => {
    dbInstance = createDb(':memory:');
  });

  afterEach(() => {
    dbInstance.close();
  });

  it('should initialize an in-memory database with configured PRAGMAs', () => {
    expect(dbInstance).toBeDefined();
    expect(dbInstance.db).toBeDefined();

    const journalMode = dbInstance.db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };

    // In-memory databases report 'memory' mode for journal_mode in SQLite
    expect(journalMode.journal_mode).toBeDefined();

    const foreignKeys = dbInstance.db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };

    expect(foreignKeys.foreign_keys).toBe(1);

    const busyTimeout = dbInstance.db.prepare('PRAGMA busy_timeout;').get() as { timeout: number };

    expect(busyTimeout.timeout).toBe(5000);
  });

  it('should delegate memoStore creation and perform basic operations', () => {
    const store = dbInstance.memoStore<string>('test_ns');

    expect(store).toBeDefined();
    expect(store.size).toBe(0);

    store.set('key1', { status: 'fulfilled', value: 'hello' });
    expect(store.has('key1')).toBe(true);
    expect(store.get('key1')).toEqual({ status: 'fulfilled', value: 'hello' });
    expect(store.size).toBe(1);
  });

  it('should close the underlying database connection cleanly', () => {
    dbInstance.close();

    expect(() => {
      dbInstance.db.prepare('SELECT 1;').get();
    }).toThrow();
  });
});

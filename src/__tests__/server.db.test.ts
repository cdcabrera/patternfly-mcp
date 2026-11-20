import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { memo } from '../server.caching';
import { memoSettledAdapter } from '../server.cachingAdapter';
import {
  createDb,
  quarantineCorruptDb,
  resolveCacheDbPath,
  verifyDbIntegrity,
  type DbInstance
} from '../server.db';
import { DEFAULT_OPTIONS } from '../options.defaults';

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

  it('should checkpoint WAL on close or manual checkpoint call', () => {
    expect(() => dbInstance.checkpoint()).not.toThrow();
  });
});

describe('resolveCacheDbPath', () => {
  const testDir = join(tmpdir(), `pf-mcp-db-test-${Date.now()}`);

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return :memory: unchanged', () => {
    expect(resolveCacheDbPath(':memory:')).toBe(':memory:');
    expect(resolveCacheDbPath('')).toBe(':memory:');
  });

  it('should auto-append the DB filename when path ends in a trailing slash and create directory', () => {
    const dirWithSlash = join(testDir, 'nested', '');
    const resolved = resolveCacheDbPath(`${dirWithSlash}/`);

    expect(resolved).toBe(join(testDir, 'nested', DEFAULT_OPTIONS.cacheDb.dbDefaultFilename));
    expect(existsSync(join(testDir, 'nested'))).toBe(true);
  });

  it('should auto-append the DB filename when path resolves to an existing directory', () => {
    mkdirSync(testDir, { recursive: true });
    const resolved = resolveCacheDbPath(testDir);

    expect(resolved).toBe(join(testDir, DEFAULT_OPTIONS.cacheDb.dbDefaultFilename));
  });

  it('should ensure parent directory exists when given a direct file path', () => {
    const filePath = join(testDir, 'subdir', 'custom.db');
    const resolved = resolveCacheDbPath(filePath);

    expect(resolved).toBe(filePath);
    expect(existsSync(join(testDir, 'subdir'))).toBe(true);
  });

  it('should respect custom dbDefaultFilename from options', () => {
    const customOptions = {
      cacheDb: { ...DEFAULT_OPTIONS.cacheDb, dbDefaultFilename: 'custom-name.db' }
    } as any;
    const resolved = resolveCacheDbPath(`${testDir}/`, customOptions);

    expect(resolved).toBe(join(testDir, 'custom-name.db'));
  });
});

describe('verifyDbIntegrity', () => {
  it('should pass for a healthy SQLite database', () => {
    const rawDb = new DatabaseSync(':memory:');

    expect(() => verifyDbIntegrity(rawDb)).not.toThrow();
    rawDb.close();
  });

  it('should throw when unauthorized views or triggers exist', () => {
    const rawDb = new DatabaseSync(':memory:');

    rawDb.exec('CREATE TABLE test (id INT);');
    rawDb.exec('CREATE VIEW unauthorized_view AS SELECT * FROM test;');

    expect(() => verifyDbIntegrity(rawDb)).toThrow(
      /unauthorized schema objects detected: view:unauthorized_view/
    );

    rawDb.close();
  });
});

describe('quarantineCorruptDb', () => {
  const testDir = join(tmpdir(), `pf-mcp-quarantine-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should rename corrupt file with timestamp suffix', () => {
    const filePath = join(testDir, 'corrupt.db');

    writeFileSync(filePath, 'NOT_A_SQLITE_DATABASE');

    const quarantinedPath = quarantineCorruptDb(filePath);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(quarantinedPath)).toBe(true);
    expect(quarantinedPath).toMatch(/corrupt\.db\.corrupt\.\d{4}-\d{2}-\d{2}T/);
    expect(readFileSync(quarantinedPath, 'utf8')).toBe('NOT_A_SQLITE_DATABASE');
  });
});

describe('createDb file-backed persistence & self-healing', () => {
  const testDir = join(tmpdir(), `pf-mcp-filebacked-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should persist data across separate createDb instances pointing to same file', () => {
    const dbFile = join(testDir, 'test.db');

    const dbInstance1 = createDb(dbFile);
    const store1 = dbInstance1.memoStore<string>('persist_ns');

    store1.set('key1', { status: 'fulfilled', value: 'persisted_val' });
    dbInstance1.close();

    const dbInstance2 = createDb(dbFile);
    const store2 = dbInstance2.memoStore<string>('persist_ns');

    expect(store2.has('key1')).toBe(true);
    expect(store2.get('key1')).toEqual({ status: 'fulfilled', value: 'persisted_val' });
    dbInstance2.close();
  });

  it('should quarantine corrupted file on startup and recreate fresh healthy database', () => {
    const dbFile = join(testDir, 'corrupted.db');

    writeFileSync(dbFile, 'GARBAGE_HEADER_CORRUPTING_SQLITE_FORMAT');

    const dbInstance = createDb(dbFile);

    expect(dbInstance).toBeDefined();
    expect(dbInstance.db.isOpen).toBe(true);

    // Fresh database should be functional
    const store = dbInstance.memoStore<string>('healed_ns');

    store.set('key', { status: 'fulfilled', value: 'recovered' });
    expect(store.get('key')).toEqual({ status: 'fulfilled', value: 'recovered' });

    dbInstance.close();
  });
});

describe('createDb memoSettledAdapter integration & cold hydration', () => {
  const testDir = join(tmpdir(), `pf-mcp-db-hydration-test-${Date.now()}`);
  let dbInstance: DbInstance | undefined;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    dbInstance?.close();
    dbInstance = undefined;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should persist settled entries to SQLite and hydrate on cold restart', async () => {
    const dbFile = join(testDir, 'cache.db');

    // Session 1: Write and persist to SQLite
    dbInstance = createDb(dbFile);
    const store1 = dbInstance.memoStore<string>('fetch_urls');
    const worker1 = jest.fn(async (url: string) => `content for ${url}`);
    const memoized1 = memo(worker1, {
      cache: memoSettledAdapter<unknown, Promise<string>>(store1)
    });

    const result1 = await memoized1('https://example.com/api/v1');

    expect(result1).toBe('content for https://example.com/api/v1');
    expect(worker1).toHaveBeenCalledTimes(1);

    // Allow asynchronous storeQueue flush to SQLite
    await new Promise(resolve => setTimeout(resolve, 20));

    // Verify SQLite row was persisted
    const row = dbInstance.db
      .prepare('SELECT value, status FROM memo_cache WHERE namespace = ?')
      .get('fetch_urls') as { value: string; status: string } | undefined;

    expect(row?.status).toBe('fulfilled');
    dbInstance.close();

    // Session 2: Cold boot restart with separate DB and memo instance
    const dbInstance2 = createDb(dbFile);
    const store2 = dbInstance2.memoStore<string>('fetch_urls');
    const worker2 = jest.fn(async (url: string) => `content for ${url}`);
    const memoized2 = memo(worker2, {
      cache: memoSettledAdapter<unknown, Promise<string>>(store2)
    });

    // Cold hit should rehydrate from SQLite without invoking worker2
    const result2 = await memoized2('https://example.com/api/v1');

    expect(result2).toBe('content for https://example.com/api/v1');
    expect(worker2).not.toHaveBeenCalled();

    dbInstance2.close();
  });

  it('should forward clear housekeeping to SQLite partition through settled adapter', async () => {
    dbInstance = createDb(':memory:');
    const store = dbInstance.memoStore<string>('isolated_ns');
    const memoized = memo(async (id: string) => `data-${id}`, {
      cache: memoSettledAdapter<unknown, Promise<string>>(store)
    });

    await memoized('item1');
    await memoized('item2');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(store.size).toBe(2);

    memoized.clear();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(store.size).toBe(0);
  });
});

describe('createDb.memo', () => {
  afterEach(() => {
    createDb.memo.clear();
  });

  it('should return identical DbInstance for identical database path', () => {
    const db1 = createDb.memo(':memory:');
    const db2 = createDb.memo(':memory:');

    expect(db1).toBe(db2);
  });

  it('should close databases when createDb.memo.clear() is called', async () => {
    const db = createDb.memo(':memory:');

    expect(db.db.isOpen).toBe(true);

    createDb.memo.clear();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(db.db.isOpen).toBe(false);
  });
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  createDb,
  quarantineCorruptDb,
  resolveCacheDbPath,
  verifyDbIntegrity,
  type DbInstance
} from '../server.db';

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

  it('should auto-append pf-mcp.db when path ends in a trailing slash and create directory', () => {
    const dirWithSlash = join(testDir, 'nested', '');
    const resolved = resolveCacheDbPath(`${dirWithSlash}/`);

    expect(resolved).toBe(join(testDir, 'nested', 'pf-mcp.db'));
    expect(existsSync(join(testDir, 'nested'))).toBe(true);
  });

  it('should auto-append pf-mcp.db when path resolves to an existing directory', () => {
    mkdirSync(testDir, { recursive: true });
    const resolved = resolveCacheDbPath(testDir);

    expect(resolved).toBe(join(testDir, 'pf-mcp.db'));
  });

  it('should ensure parent directory exists when given a direct file path', () => {
    const filePath = join(testDir, 'subdir', 'custom.db');
    const resolved = resolveCacheDbPath(filePath);

    expect(resolved).toBe(filePath);
    expect(existsSync(join(testDir, 'subdir'))).toBe(true);
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

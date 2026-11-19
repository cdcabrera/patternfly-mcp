import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { log } from './logger';
import { createDbMemoStore, type DbMemoStoreOptions } from './server.dbMemoStore';
import type { MemoMapLike } from './server.caching';
import type { MemoSettled } from './server.cachingAdapter';

/**
 * Options for configuring the SQLite database connection.
 *
 * @property [busyTimeout] - Milliseconds to wait before throwing SQLITE_BUSY.
 */
interface DbOptions {
  busyTimeout?: number | undefined;
}

/**
 * SQLite database instance manager interface.
 */
interface DbInstance {
  readonly db: DatabaseSync;
  close(): void;
  checkpoint(): void;
  memoStore<V = unknown>(namespace: string, options?: DbMemoStoreOptions): MemoMapLike<unknown, MemoSettled<V>>;
}

/**
 * Resolve database path, creating parent directory and appending default filename if needed.
 *
 * @param inputPath - Raw database path or ':memory:'.
 * @returns Resolved filesystem path or ':memory:'.
 */
const resolveCacheDbPath = (inputPath: string = ':memory:'): string => {
  if (!inputPath || inputPath === ':memory:') {
    return ':memory:';
  }

  let resolvedPath = resolve(inputPath);
  const isDirectoryTarget = inputPath.endsWith('/') || inputPath.endsWith('\\');

  if (isDirectoryTarget || (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory())) {
    resolvedPath = join(resolvedPath, 'pf-mcp.db');
  }

  const parentDir = dirname(resolvedPath);

  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  return resolvedPath;
};

/**
 * Verify SQLite database integrity, foreign keys, and absence of injected triggers or views.
 *
 * @param db - The SQLite DatabaseSync instance to verify.
 * @throws Error if structural check fails or unauthorized objects are detected.
 */
const verifyDbIntegrity = (db: DatabaseSync): void => {
  const quickCheck = db.prepare('PRAGMA quick_check;').get() as { quick_check?: string } | undefined;

  if (quickCheck?.quick_check !== 'ok') {
    throw new Error(`Database quick_check failed: ${quickCheck?.quick_check || 'unknown error'}`);
  }

  const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();

  if (fkErrors.length > 0) {
    throw new Error(`Database foreign_key_check failed with ${fkErrors.length} violation(s)`);
  }

  const injectedObjects = db
    .prepare("SELECT type, name FROM sqlite_schema WHERE type IN ('trigger', 'view');")
    .all() as Array<{ type: string; name: string }>;

  if (injectedObjects.length > 0) {
    const names = injectedObjects.map(item => `${item.type}:${item.name}`).join(', ');

    throw new Error(`Database integrity violation: unauthorized schema objects detected: ${names}`);
  }
};

/**
 * Move corrupted database file aside to preserve evidence and allow clean reinitialization.
 *
 * @param filePath - Path to the corrupt database file.
 * @returns Path to the renamed quarantine file.
 */
const quarantineCorruptDb = (filePath: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = `${filePath}.corrupt.${timestamp}`;

  renameSync(filePath, quarantinePath);
  log.warn(`Corrupt SQLite database quarantined: ${filePath} -> ${quarantinePath}`);

  return quarantinePath;
};

/**
 * Open and configure a DatabaseSync instance with standard PRAGMAs.
 *
 * @param resolvedPath - Filesystem path or ':memory:'.
 * @param busyTimeout - Milliseconds to wait before throwing SQLITE_BUSY.
 * @returns Open DatabaseSync instance.
 */
const openDatabase = (resolvedPath: string, busyTimeout: number): DatabaseSync => {
  const db = new DatabaseSync(resolvedPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;
    PRAGMA busy_timeout = ${busyTimeout};
  `);

  return db;
};

/**
 * Create and configure an SQLite database instance.
 *
 * @param database - File path or `:memory:` for in-memory database.
 * @param [options] - Configuration options for the DB instance.
 * @param [options.busyTimeout] - Milliseconds to wait.
 * @returns Configured DbInstance.
 */
const createDb = (database: string = ':memory:', { busyTimeout = 5000 }: DbOptions = {}): DbInstance => {
  const resolvedPath = resolveCacheDbPath(database);
  let db: DatabaseSync;

  try {
    db = openDatabase(resolvedPath, busyTimeout);
    verifyDbIntegrity(db);
  } catch (error) {
    if (resolvedPath !== ':memory:' && existsSync(resolvedPath)) {
      quarantineCorruptDb(resolvedPath);
      db = openDatabase(resolvedPath, busyTimeout);
      verifyDbIntegrity(db);
    } else {
      throw error;
    }
  }

  const checkpoint = (): void => {
    if (db.isOpen) {
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        // Ignore checkpoint errors during shutdown
      }
    }
  };

  return {
    db,
    checkpoint,
    close(): void {
      if (db.isOpen) {
        checkpoint();
        db.close();
      }
    },
    memoStore<V = unknown>(namespace: string, storeOptions?: DbMemoStoreOptions): MemoMapLike<unknown, MemoSettled<V>> {
      return createDbMemoStore<V>(db, namespace, storeOptions);
    }
  };
};

export {
  createDb,
  quarantineCorruptDb,
  resolveCacheDbPath,
  verifyDbIntegrity,
  type DbInstance,
  type DbOptions
};

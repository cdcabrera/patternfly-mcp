import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { log } from './logger';
import { createDbMemoStore, type DbMemoStoreOptions } from './server.dbMemoStore';
import { memo, type MemoMapLike } from './server.caching';
import { type MemoSettled } from './server.cachingAdapter';
import { getOptions } from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import { type GlobalOptions } from './options';

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
 * Default in-memory db.
 */
const DEFAULT_DB = DEFAULT_OPTIONS.cacheDb.dbPath;

/**
 * Resolve database path, create a parent directory, and appending a default filename if needed.
 *
 * @param inputPath - Raw database path or {@link DEFAULT_DB}.
 * @param {GlobalOptions} options - Optional configuration.
 * @returns Resolved filesystem path or {@link DEFAULT_DB}.
 */
const resolveCacheDbPath = (inputPath: string = DEFAULT_DB, options = getOptions()): string => {
  const { dbPath, dbDefaultFilename } = options.cacheDb;

  if (!inputPath || inputPath === dbPath) {
    return dbPath;
  }

  let resolvedPath = resolve(inputPath);
  const isDirectoryTarget = inputPath.endsWith('/') || inputPath.endsWith('\\');

  if (isDirectoryTarget || (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory())) {
    resolvedPath = join(resolvedPath, dbDefaultFilename);
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
 * @param resolvedPath - Filesystem path or {@link DEFAULT_DB}.
 * @param busyTimeout - Milliseconds to wait before throwing SQLITE_BUSY.
 * @returns Open DatabaseSync instance.
 */
const openDatabase = (resolvedPath: string, busyTimeout: number): DatabaseSync => {
  const db = new DatabaseSync(resolvedPath);

  log.debug(`Opening SQLite database (${resolvedPath})`);

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
 * @param database - File path or {@link DEFAULT_DB}.
 * @param {GlobalOptions}[options] - Optional configuration options for the DB instance.
 * @returns Configured DbInstance.
 */
const createDb = (database: string = DEFAULT_DB, options: GlobalOptions = getOptions()): DbInstance => {
  const { dbPath, busyTimeoutMs } = options.cacheDb;
  const resolvedPath = resolveCacheDbPath(database);
  let db: DatabaseSync;

  try {
    db = openDatabase(resolvedPath, busyTimeoutMs);
    verifyDbIntegrity(db);
  } catch (error) {
    if (resolvedPath !== dbPath && existsSync(resolvedPath)) {
      quarantineCorruptDb(resolvedPath);
      db = openDatabase(resolvedPath, busyTimeoutMs);
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

/**
 * Memoized instance of createDb.
 *   - Returns the identical database connection handle for matching paths
 *   - Closes and checkpoints the database when the "database memo" rolls out, not the cached entries themselves
 *   - Limited to a single active database connection instance
 */
createDb.memo = memo(
  (database: string = DEFAULT_DB, options: GlobalOptions = getOptions()) => createDb(database, options),
  {
    cacheLimit: 1,
    onCacheRollout: async ({ removed }) => {
      const results = await Promise.allSettled(removed.values());

      for (const result of results) {
        if (result.status === 'fulfilled') {
          try {
            await result.value.close();
          } catch (error) {
            // Avoid engaging the contextual log channel on rollout.
            console.error(`Error stopping database: ${error}`);
          }
        } else {
          // Avoid engaging the contextual log channel on rollout.
          console.error(`Error cleaning up database: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  createDb,
  quarantineCorruptDb,
  resolveCacheDbPath,
  verifyDbIntegrity,
  type DbInstance,
  type DbOptions
};

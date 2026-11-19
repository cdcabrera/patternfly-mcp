import { DatabaseSync } from 'node:sqlite';
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
  memoStore<V = unknown>(namespace: string, options?: DbMemoStoreOptions): MemoMapLike<unknown, MemoSettled<V>>;
}

/**
 * Create and configure an SQLite database instance.
 *
 * @param database - File path or `:memory:` for in-memory database.
 * @param [options] - Configuration options for the DB instance.
 * @param [options.busyTimeout] - Milliseconds to wait.
 * @returns Configured DbInstance.
 */
const createDb = (database: string = ':memory:', { busyTimeout = 5000 }: DbOptions = {}): DbInstance => {
  const db = new DatabaseSync(database);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;
    PRAGMA busy_timeout = ${busyTimeout};
  `);

  return {
    db,
    close(): void {
      if (db.isOpen) {
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
  type DbInstance,
  type DbOptions
};

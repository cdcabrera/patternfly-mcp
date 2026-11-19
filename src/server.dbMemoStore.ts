import { type DatabaseSync, type StatementSync } from 'node:sqlite';
import { generateHash } from './server.helpers';
import type { MemoMapLike } from './server.caching';
import type { MemoSettled } from './server.cachingAdapter';

/**
 * Options for configuring a specific memo namespace storage partition.
 *
 * @property [expire] - Time-to-live in milliseconds for entries in this namespace.
 */
interface DbMemoStoreOptions {
  expire?: number | undefined;
}

/**
 * Internal row representation in the `memo_cache` table.
 */
interface MemoCacheRow {
  namespace: string;
  key_hash: string;
  value: string;
  status: 'fulfilled' | 'rejected';
  is_promise: number;
  created_at: number;
  expires_at: number | null;
  access_count: number;
  last_accessed_at: number;
}

/**
 * DDL statement for creating the memo_cache table and its indexes.
 */
const MEMO_CACHE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS memo_cache (
    namespace TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    value TEXT NOT NULL,
    status TEXT NOT NULL,
    is_promise INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    access_count INTEGER DEFAULT 1,
    last_accessed_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, key_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_memo_ns ON memo_cache (namespace);
  CREATE INDEX IF NOT EXISTS idx_memo_expires ON memo_cache (expires_at);
`;

/**
 * Initialize the memo_cache table schema within the given database instance.
 *
 * @param db - The SQLite DatabaseSync instance.
 */
const initMemoCacheTable = (db: DatabaseSync): void => {
  db.exec(MEMO_CACHE_SCHEMA_SQL);
};

/**
 * Create a namespace-partitioned MemoMapLike store backed by the memo_cache table.
 *
 * @param db - DatabaseSync instance.
 * @param namespace - Partition namespace identifier.
 * @param [options] - Partition options such as expire.
 * @returns MemoMapLike store compatible with memoSettledAdapter.
 */
const createDbMemoStore = <V = unknown>(
  db: DatabaseSync,
  namespace: string,
  options: DbMemoStoreOptions = {}
): MemoMapLike<unknown, MemoSettled<V>> => {
  initMemoCacheTable(db);

  const { expire } = options;

  const stmtHas: StatementSync = db.prepare(`
    SELECT 1 FROM memo_cache
    WHERE namespace = ? AND key_hash = ? AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1;
  `);

  const stmtGet: StatementSync = db.prepare(`
    SELECT value, expires_at FROM memo_cache
    WHERE namespace = ? AND key_hash = ? AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1;
  `);

  const stmtUpdateAccess: StatementSync = db.prepare(`
    UPDATE memo_cache
    SET access_count = access_count + 1, last_accessed_at = ?
    WHERE namespace = ? AND key_hash = ?;
  `);

  const stmtSet: StatementSync = db.prepare(`
    INSERT INTO memo_cache (
      namespace, key_hash, value, status, is_promise, created_at, expires_at, access_count, last_accessed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(namespace, key_hash) DO UPDATE SET
      value = excluded.value,
      status = excluded.status,
      is_promise = excluded.is_promise,
      expires_at = excluded.expires_at,
      access_count = memo_cache.access_count + 1,
      last_accessed_at = excluded.last_accessed_at;
  `);

  const stmtDelete: StatementSync = db.prepare(`
    DELETE FROM memo_cache WHERE namespace = ? AND key_hash = ?;
  `);

  const stmtClear: StatementSync = db.prepare(`
    DELETE FROM memo_cache WHERE namespace = ?;
  `);

  const stmtSize: StatementSync = db.prepare(`
    SELECT COUNT(*) as count FROM memo_cache
    WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?);
  `);

  const stmtKeys: StatementSync = db.prepare(`
    SELECT key_hash FROM memo_cache
    WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at ASC;
  `);

  const stmtEntries: StatementSync = db.prepare(`
    SELECT key_hash, value FROM memo_cache
    WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at ASC;
  `);

  const toKeyHash = (key: unknown): string => (typeof key === 'string' ? key : generateHash(key));

  return {
    has(key: unknown): boolean {
      const keyHash = toKeyHash(key);
      const row = stmtHas.get(namespace, keyHash, Date.now());

      return row !== undefined;
    },

    get(key: unknown): MemoSettled<V> | undefined {
      const now = Date.now();
      const keyHash = toKeyHash(key);
      const row = stmtGet.get(namespace, keyHash, now) as { value: string; expires_at: number | null } | undefined;

      if (!row) {
        return undefined;
      }

      stmtUpdateAccess.run(now, namespace, keyHash);

      try {
        return JSON.parse(row.value) as MemoSettled<V>;
      } catch {
        stmtDelete.run(namespace, keyHash);

        return undefined;
      }
    },

    set(key: unknown, value: MemoSettled<V>): void {
      const now = Date.now();
      const keyHash = toKeyHash(key);
      const expiresAt = expire ? now + expire : null;
      const status = value?.status === 'rejected' ? 'rejected' : 'fulfilled';
      const isPromise = value?.isPromise ? 1 : 0;
      const serialized = JSON.stringify(value);

      stmtSet.run(namespace, keyHash, serialized, status, isPromise, now, expiresAt, now);
    },

    delete(key: unknown): boolean {
      const keyHash = toKeyHash(key);
      const result = stmtDelete.run(namespace, keyHash);

      return Number(result.changes) > 0;
    },

    clear(): void {
      stmtClear.run(namespace);
    },

    get size(): number {
      const row = stmtSize.get(namespace, Date.now()) as { count: number } | undefined;

      return Number(row?.count ?? 0);
    },

    keys(): IterableIterator<unknown> {
      const rows = stmtKeys.all(namespace, Date.now()) as Array<{ key_hash: string }>;

      return rows.map(row => row.key_hash).values();
    },

    entries(): IterableIterator<[unknown, MemoSettled<V>]> {
      const rows = stmtEntries.all(namespace, Date.now()) as Array<{ key_hash: string; value: string }>;
      const list: Array<[unknown, MemoSettled<V>]> = [];

      for (const row of rows) {
        try {
          list.push([row.key_hash, JSON.parse(row.value) as MemoSettled<V>]);
        } catch {
          // Skip corrupted rows during iteration
        }
      }

      return list.values();
    }
  };
};

export {
  createDbMemoStore,
  initMemoCacheTable,
  MEMO_CACHE_SCHEMA_SQL,
  type DbMemoStoreOptions,
  type MemoCacheRow
};

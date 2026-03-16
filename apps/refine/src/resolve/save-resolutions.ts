/**
 * Persist user resolutions to the SQLite database.
 * @module resolve/save-resolutions
 */
import crypto from 'node:crypto';

/** Minimal interface for a better-sqlite3 database. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): void; get(): unknown };
  transaction<T>(fn: (args: T) => void): (args: T) => void;
}

/** A resolution record to be saved. */
export interface ResolutionRecord {
  detectionType: string;
  nodeIds: string[];
  action: 'keep' | 'dismissed' | 'resolved';
  reason?: string;
}

/** Ensure the resolutions table exists. */
function ensureTable(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resolutions (
      id TEXT PRIMARY KEY,
      detection_type TEXT NOT NULL,
      node_ids TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Save resolution records to the SQLite database.
 * Creates the resolutions table if it doesn't exist.
 */
export function saveResolutions(db: unknown, records: ResolutionRecord[]): void {
  const sqlDb = db as SqliteDb;
  ensureTable(sqlDb);

  const stmt = sqlDb.prepare(
    'INSERT INTO resolutions (id, detection_type, node_ids, action, reason) VALUES (?, ?, ?, ?, ?)',
  );

  const insertMany = sqlDb.transaction((recs: ResolutionRecord[]) => {
    for (const r of recs) {
      stmt.run(
        crypto.randomUUID(),
        r.detectionType,
        JSON.stringify(r.nodeIds),
        r.action,
        r.reason ?? null,
      );
    }
  });

  insertMany(records);
}

/** Count total resolutions in the database. */
export function countResolutions(db: unknown): number {
  const sqlDb = db as SqliteDb;
  ensureTable(sqlDb);
  const row = sqlDb.prepare('SELECT COUNT(*) as count FROM resolutions').get() as { count: number };
  return row.count;
}

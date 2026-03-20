/**
 * SQLite-backed implementation of IngestLog for tracking ingested files.
 * @module ingest/ingest-log
 */
import type { IngestLog } from './pipeline.js';

/** Minimal SQLite database interface (subset of better-sqlite3). */
interface SqliteDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

/** Row shape returned from the ingest_log table. */
interface IngestLogRow {
  file_hash: string;
}

/** SQLite-backed ingest log for tracking file hashes and resumability. */
export class SQLiteIngestLog implements IngestLog {
  private readonly db: SqliteDb;

  constructor(db: SqliteDb) {
    this.db = db;
  }

  /** Get the stored hash for a file path, or null if not yet ingested. */
  async getHash(filePath: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT file_hash FROM ingest_log WHERE file_path = ?')
      .get(filePath) as IngestLogRow | undefined;
    return row?.file_hash ?? null;
  }

  /** Record a file's hash and node count after successful ingestion. */
  async record(filePath: string, hash: string, nodeCount: number): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO ingest_log (file_path, file_hash, node_count) VALUES (?, ?, ?)',
      )
      .run(filePath, hash, nodeCount);
  }
}

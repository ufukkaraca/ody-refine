/**
 * Persists and queries DPO preference pairs in SQLite.
 * @module feedback/pair-store
 */

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { PreferencePair, DetectionType } from '@useody/platform-core';

/** Minimal interface for a better-sqlite3 database. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

/** Minimal interface for a prepared statement. */
interface SqliteStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** Raw row from the preference_pairs table. */
interface PairRow {
  id: string;
  prompt: string;
  chosen: string;
  rejected: string;
  conflict_type: string;
  resolved_by: string;
  resolved_at: string;
  confidence: number;
  source_node_ids: string;
  exported: number;
  created_at: string;
}

/** Ensure the preference_pairs table exists. */
function ensureTable(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS preference_pairs (
      id TEXT PRIMARY KEY NOT NULL,
      prompt TEXT NOT NULL,
      chosen TEXT NOT NULL,
      rejected TEXT NOT NULL,
      conflict_type TEXT NOT NULL,
      resolved_by TEXT NOT NULL DEFAULT 'cli-user',
      resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
      confidence REAL NOT NULL DEFAULT 1.0,
      source_node_ids TEXT NOT NULL DEFAULT '[]',
      exported INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pairs_exported
      ON preference_pairs(exported);
    CREATE INDEX IF NOT EXISTS idx_pairs_conflict_type
      ON preference_pairs(conflict_type);
  `);
}

/** Convert a raw row to a PreferencePair. */
function rowToPair(row: PairRow): PreferencePair {
  return {
    prompt: row.prompt,
    chosen: row.chosen,
    rejected: row.rejected,
    metadata: {
      conflictType: row.conflict_type as DetectionType,
      resolvedBy: row.resolved_by,
      resolvedAt: new Date(row.resolved_at),
      confidence: row.confidence,
      sourceNodeIds: JSON.parse(row.source_node_ids) as string[],
    },
  };
}

/**
 * Store for DPO preference pairs backed by SQLite.
 * Handles persistence, batch operations, and JSONL export.
 */
export class PreferencePairStore {
  private readonly db: SqliteDb;

  constructor(db: unknown) {
    this.db = db as SqliteDb;
    ensureTable(this.db);
  }

  /** Save a single preference pair. */
  save(pair: PreferencePair): void {
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO preference_pairs
        (id, prompt, chosen, rejected, conflict_type, resolved_by, resolved_at, confidence, source_node_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      pair.prompt,
      pair.chosen,
      pair.rejected,
      pair.metadata.conflictType,
      pair.metadata.resolvedBy,
      pair.metadata.resolvedAt.toISOString(),
      pair.metadata.confidence,
      JSON.stringify(pair.metadata.sourceNodeIds),
    );
  }

  /** Save multiple preference pairs in a single transaction. */
  saveBatch(pairs: PreferencePair[]): void {
    if (pairs.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO preference_pairs
        (id, prompt, chosen, rejected, conflict_type, resolved_by, resolved_at, confidence, source_node_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertAll = this.db.transaction((items: PreferencePair[]) => {
      for (const pair of items) {
        stmt.run(
          crypto.randomUUID(),
          pair.prompt,
          pair.chosen,
          pair.rejected,
          pair.metadata.conflictType,
          pair.metadata.resolvedBy,
          pair.metadata.resolvedAt.toISOString(),
          pair.metadata.confidence,
          JSON.stringify(pair.metadata.sourceNodeIds),
        );
      }
    });

    insertAll(pairs as never);
  }

  /** Find all preference pairs regardless of export status. */
  findAll(): PreferencePair[] {
    const rows = this.db.prepare(
      'SELECT * FROM preference_pairs ORDER BY created_at ASC',
    ).all() as PairRow[];

    return rows.map(rowToPair);
  }

  /** Find all unexported preference pairs. */
  findUnexported(): PreferencePair[] {
    const rows = this.db.prepare(
      'SELECT * FROM preference_pairs WHERE exported = 0 ORDER BY created_at ASC',
    ).all() as PairRow[];

    return rows.map(rowToPair);
  }

  /** Mark a list of pair IDs as exported. */
  markExported(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(
      `UPDATE preference_pairs SET exported = 1 WHERE id IN (${placeholders})`,
    ).run(...ids);
  }

  /** Count total preference pairs. */
  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM preference_pairs',
    ).get() as { cnt: number };
    return row.cnt;
  }

  /** Count unexported preference pairs. */
  countUnexported(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM preference_pairs WHERE exported = 0',
    ).get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Export unexported pairs to a JSONL file and mark them as exported.
   * Each line contains: {"prompt", "chosen", "rejected"}.
   * @returns The number of pairs exported.
   */
  exportDpo(outputPath: string): number {
    const rows = this.db.prepare(
      'SELECT * FROM preference_pairs WHERE exported = 0 ORDER BY created_at ASC',
    ).all() as PairRow[];

    if (rows.length === 0) return 0;

    const lines = rows.map((row) =>
      JSON.stringify({
        prompt: row.prompt,
        chosen: row.chosen,
        rejected: row.rejected,
      }),
    );

    writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');

    const ids = rows.map((r) => r.id);
    this.markExported(ids);

    return rows.length;
  }
}

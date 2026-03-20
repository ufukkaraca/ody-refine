/**
 * Retraining history — tracks when retraining runs happened and their outcomes.
 * @module training/retraining-history
 */

/** A single retraining event record. */
export interface RetrainingEvent {
  id: string;
  modelId: string | null;
  baseModel: string;
  pairCount: number;
  evalScores: Record<string, number> | null;
  passed: boolean;
  reason: string;
  triggeredBy: 'auto' | 'manual' | 'force';
  createdAt: Date;
}

/** Minimal SQLite interface for retraining history. */
interface HistoryDb {
  exec(sql: string): void;
  prepare(sql: string): HistoryStatement;
}

/** Minimal prepared statement interface. */
interface HistoryStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** Raw row from retraining_history table. */
interface HistoryRow {
  id: string;
  model_id: string | null;
  base_model: string;
  pair_count: number;
  eval_scores: string | null;
  passed: number;
  reason: string;
  triggered_by: string;
  created_at: string;
}

/** Ensure the retraining_history table exists. */
function ensureHistoryTable(db: HistoryDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS retraining_history (
      id TEXT PRIMARY KEY NOT NULL,
      model_id TEXT,
      base_model TEXT NOT NULL,
      pair_count INTEGER NOT NULL DEFAULT 0,
      eval_scores TEXT,
      passed INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      triggered_by TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_retraining_history_created
      ON retraining_history(created_at);
  `);
}

/** Convert a row to a RetrainingEvent. */
function rowToEvent(row: HistoryRow): RetrainingEvent {
  return {
    id: row.id,
    modelId: row.model_id,
    baseModel: row.base_model,
    pairCount: row.pair_count,
    evalScores: row.eval_scores
      ? (JSON.parse(row.eval_scores) as Record<string, number>)
      : null,
    passed: row.passed === 1,
    reason: row.reason,
    triggeredBy: row.triggered_by as RetrainingEvent['triggeredBy'],
    createdAt: new Date(row.created_at),
  };
}

/** Tracks retraining runs and provides history queries. */
export class RetrainingHistory {
  private readonly db: HistoryDb;

  constructor(db: unknown) {
    this.db = db as HistoryDb;
    ensureHistoryTable(this.db);
  }

  /** Record a retraining event. */
  record(event: RetrainingEvent): void {
    this.db.prepare(
      `INSERT INTO retraining_history
        (id, model_id, base_model, pair_count, eval_scores, passed, reason, triggered_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.id,
      event.modelId,
      event.baseModel,
      event.pairCount,
      event.evalScores ? JSON.stringify(event.evalScores) : null,
      event.passed ? 1 : 0,
      event.reason,
      event.triggeredBy,
      event.createdAt.toISOString(),
    );
  }

  /** Get the most recent retraining event. */
  getLatest(): RetrainingEvent | null {
    const row = this.db.prepare(
      'SELECT * FROM retraining_history ORDER BY created_at DESC LIMIT 1',
    ).get() as HistoryRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  /** Get hours since last training (or Infinity if never trained). */
  hoursSinceLastTraining(): number {
    const latest = this.getLatest();
    if (!latest) return Infinity;
    return (Date.now() - latest.createdAt.getTime()) / (1000 * 60 * 60);
  }

  /** List recent retraining events. */
  list(limit: number = 10): RetrainingEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM retraining_history ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as HistoryRow[];
    return rows.map(rowToEvent);
  }

  /** Count total retraining events. */
  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM retraining_history',
    ).get() as { cnt: number };
    return row.cnt;
  }
}

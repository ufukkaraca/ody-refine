/**
 * Stores and retrieves detections from SQLite.
 * Allows report command to use pipeline-generated detections.
 * @module detect/detection-store
 */
import type { Detection } from '@useody/platform-core';

/** Generic DB handle — accepts better-sqlite3 Database. */
interface SqliteDb {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
}

const DDL = `
CREATE TABLE IF NOT EXISTS cached_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  node_ids TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_action TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const HEALTH_SCORE_DDL = `
CREATE TABLE IF NOT EXISTS cached_health_score (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  overall INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/** Save detections to SQLite for later retrieval by report command. */
export function saveDetections(
  db: SqliteDb,
  detections: Detection[],
): void {
  db.exec(DDL);
  db.exec('DELETE FROM cached_detections');
  const stmt = db.prepare(
    `INSERT INTO cached_detections (type, severity, node_ids, description, suggested_action, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const d of detections) {
      stmt.run(
        d.type,
        d.severity,
        JSON.stringify(d.nodeIds),
        d.description,
        d.suggestedAction ?? null,
        d.metadata ? JSON.stringify(d.metadata) : null,
      );
    }
  });
  tx();
}

/** Save the overall health score for later retrieval by badge command. */
export function saveHealthScore(db: SqliteDb, overall: number): void {
  db.exec(HEALTH_SCORE_DDL);
  db.prepare('INSERT OR REPLACE INTO cached_health_score (id, overall) VALUES (1, ?)').run(overall);
}

/** Load the cached health score. Returns null if not yet stored. */
export function loadHealthScore(db: SqliteDb): number | null {
  try {
    const row = db.prepare('SELECT overall FROM cached_health_score WHERE id = 1')
      .all() as Array<{ overall: number }>;
    return row.length > 0 ? row[0]!.overall : null;
  } catch {
    return null;
  }
}

/** Load cached detections. Returns null if no cache exists. */
export function loadDetections(
  db: SqliteDb,
): Detection[] | null {
  try {
    const rows = db.prepare(
      'SELECT type, severity, node_ids, description, suggested_action, metadata FROM cached_detections ORDER BY id',
    ).all() as Array<{
      type: string;
      severity: string;
      node_ids: string;
      description: string;
      suggested_action: string | null;
      metadata: string | null;
    }>;
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      type: r.type as Detection['type'],
      severity: r.severity as Detection['severity'],
      nodeIds: JSON.parse(r.node_ids) as string[],
      description: r.description,
      suggestedAction: r.suggested_action ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : undefined,
    }));
  } catch {
    return null;
  }
}

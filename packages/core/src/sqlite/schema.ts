/**
 * SQLite schema DDL for the Ody knowledge graph.
 * @module sqlite/schema
 */
import type Database from 'better-sqlite3';

/**
 * Create all tables and indexes for the knowledge graph.
 * @param db - An open better-sqlite3 database instance.
 * @param dim - Embedding vector dimension for the vec0 virtual table.
 */
export function createSchema(db: Database.Database, dim: number): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content_summary TEXT NOT NULL,
      content_facts TEXT,
      content_entities TEXT,
      content_source TEXT,
      content_raw TEXT,
      embedding BLOB,
      embedding_model TEXT NOT NULL,
      embedding_dim INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_updated_at
      ON knowledge_nodes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_nodes_confidence
      ON knowledge_nodes(confidence);
    CREATE INDEX IF NOT EXISTS idx_nodes_embedding_model
      ON knowledge_nodes(embedding_model);

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source_id
      ON knowledge_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target_id
      ON knowledge_edges(target_id);
    CREATE INDEX IF NOT EXISTS idx_edges_type
      ON knowledge_edges(type);
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[${dim}] distance_metric=cosine
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ingest_log (
      file_path TEXT PRIMARY KEY NOT NULL,
      file_hash TEXT NOT NULL,
      node_count INTEGER NOT NULL DEFAULT 0,
      ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS detection_log (
      detector_type TEXT NOT NULL,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      node_count INTEGER NOT NULL,
      detection_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      PRIMARY KEY (detector_type, run_at)
    );

    CREATE TABLE IF NOT EXISTS resolutions (
      id TEXT PRIMARY KEY NOT NULL,
      detection_type TEXT NOT NULL,
      chosen_node_id TEXT REFERENCES knowledge_nodes(id),
      rejected_node_id TEXT REFERENCES knowledge_nodes(id),
      resolution_text TEXT,
      resolved_by TEXT NOT NULL DEFAULT 'user',
      resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_node_ids TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      exported INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_resolutions_exported
      ON resolutions(exported);
    CREATE INDEX IF NOT EXISTS idx_resolutions_type
      ON resolutions(detection_type);

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

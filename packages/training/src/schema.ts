/**
 * SQLite DDL for training tables.
 * @module training/schema
 */

import type Database from 'better-sqlite3';

const DATASET_VERSIONS_DDL = `
CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  data_path TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  preference_pair_count INTEGER NOT NULL DEFAULT 0,
  sft_entry_count INTEGER NOT NULL DEFAULT 0,
  eval_item_count INTEGER NOT NULL DEFAULT 0,
  source_audit_id TEXT,
  lineage_parent_version_id TEXT,
  lineage_source_type TEXT NOT NULL DEFAULT 'manual_upload',
  lineage_refined_at TEXT,
  lineage_node_filter TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const TRAINING_RUNS_DDL = `
CREATE TABLE IF NOT EXISTS training_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  base_model TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('sft', 'dpo', 'grpo')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','preparing','training','evaluating','completed','failed')),
  eval_scores TEXT,
  artifact_path TEXT,
  preference_pair_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dataset_id) REFERENCES dataset_versions(id)
)`;

const REGISTERED_MODELS_DDL = `
CREATE TABLE IF NOT EXISTS registered_models (
  id TEXT PRIMARY KEY,
  base_model TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  training_run_id TEXT NOT NULL,
  eval_scores TEXT,
  artifact_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'training'
    CHECK (status IN ('training', 'ready', 'deployed', 'retired')),
  deployed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dataset_id) REFERENCES dataset_versions(id),
  FOREIGN KEY (training_run_id) REFERENCES training_runs(id)
)`;

/** Migrate existing tables to add new columns. */
function migrateSchema(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info('dataset_versions')")
    .all() as { name: string }[];
  const colNames = new Set(columns.map((c) => c.name));
  if (columns.length > 0 && !colNames.has('sft_entry_count')) {
    db.exec(
      'ALTER TABLE dataset_versions ADD COLUMN sft_entry_count INTEGER NOT NULL DEFAULT 0',
    );
  }
}

/**
 * Create all training-related tables in the SQLite database.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
export function createTrainingSchema(db: Database.Database): void {
  db.exec(DATASET_VERSIONS_DDL);
  db.exec(TRAINING_RUNS_DDL);
  db.exec(REGISTERED_MODELS_DDL);
  migrateSchema(db);
}

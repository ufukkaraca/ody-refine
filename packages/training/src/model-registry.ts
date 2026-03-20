/**
 * Model registry backed by SQLite.
 * @module training/model-registry
 */

import type Database from 'better-sqlite3';
import type { RegisteredModel, ModelStatus } from './types.js';

/** Valid status transitions for registered models. */
const VALID_TRANSITIONS: Record<ModelStatus, ModelStatus[]> = {
  training: ['ready', 'failed' as ModelStatus],
  ready: ['deployed', 'retired'],
  deployed: ['retired'],
  retired: [],
};

/** Row shape from SQLite registered_models table. */
interface ModelRow {
  id: string;
  base_model: string;
  dataset_id: string;
  training_run_id: string;
  eval_scores: string | null;
  artifact_path: string;
  status: string;
  deployed_at: string | null;
  created_at: string;
}

/** Registry for managing trained models in SQLite. */
export class ModelRegistry {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Register a new model. */
  register(model: RegisteredModel): RegisteredModel {
    const stmt = this.db.prepare(`
      INSERT INTO registered_models
        (id, base_model, dataset_id, training_run_id, eval_scores,
         artifact_path, status, deployed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      model.id,
      model.baseModel,
      model.datasetId,
      model.trainingRunId,
      model.evalScores ? JSON.stringify(model.evalScores) : null,
      model.artifactPath,
      model.status,
      model.deployedAt?.toISOString() ?? null,
      model.createdAt.toISOString(),
    );
    return model;
  }

  /** Transition a model's status with validation. */
  updateStatus(id: string, newStatus: ModelStatus): void {
    const model = this.findById(id);
    if (!model) throw new Error(`Model not found: ${id}`);

    const allowed = VALID_TRANSITIONS[model.status];
    if (!allowed?.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${model.status} → ${newStatus}`,
      );
    }

    const deployedAt =
      newStatus === 'deployed' ? new Date().toISOString() : null;

    if (deployedAt) {
      this.db
        .prepare(
          'UPDATE registered_models SET status = ?, deployed_at = ? WHERE id = ?',
        )
        .run(newStatus, deployedAt, id);
    } else {
      this.db
        .prepare('UPDATE registered_models SET status = ? WHERE id = ?')
        .run(newStatus, id);
    }
  }

  /** Find a model by ID. */
  findById(id: string): RegisteredModel | null {
    const row = this.db
      .prepare('SELECT * FROM registered_models WHERE id = ?')
      .get(id) as ModelRow | undefined;
    return row ? this.toRegisteredModel(row) : null;
  }

  /** List models by status. */
  listByStatus(status: ModelStatus): RegisteredModel[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM registered_models WHERE status = ? ORDER BY created_at DESC',
      )
      .all(status) as ModelRow[];
    return rows.map((r) => this.toRegisteredModel(r));
  }

  /** Get the currently deployed model (most recently deployed). */
  getDeployed(): RegisteredModel | null {
    const row = this.db
      .prepare(
        `SELECT * FROM registered_models
         WHERE status = 'deployed'
         ORDER BY deployed_at DESC LIMIT 1`,
      )
      .get() as ModelRow | undefined;
    return row ? this.toRegisteredModel(row) : null;
  }

  private toRegisteredModel(row: ModelRow): RegisteredModel {
    return {
      id: row.id,
      baseModel: row.base_model,
      datasetId: row.dataset_id,
      trainingRunId: row.training_run_id,
      evalScores: row.eval_scores
        ? (JSON.parse(row.eval_scores) as Record<string, number>)
        : undefined,
      artifactPath: row.artifact_path,
      status: row.status as ModelStatus,
      deployedAt: row.deployed_at ? new Date(row.deployed_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

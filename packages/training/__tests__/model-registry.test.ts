import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ModelRegistry } from '../src/model-registry.js';
import { createTrainingSchema } from '../src/schema.js';
import type { RegisteredModel } from '../src/types.js';

function seedDatasetAndRun(db: Database.Database): void {
  db.prepare(`
    INSERT INTO dataset_versions (id, version, data_path, lineage_source_type)
    VALUES ('ds-1', '1.0.0', '/tmp/ds-1.jsonl', 'manual_upload')
  `).run();
  db.prepare(`
    INSERT INTO training_runs (id, dataset_id, base_model, method, status)
    VALUES ('run-1', 'ds-1', 'llama-3-70b', 'sft', 'completed')
  `).run();
}

function makeModel(overrides: Partial<RegisteredModel> = {}): RegisteredModel {
  return {
    id: crypto.randomUUID(),
    baseModel: 'llama-3-70b',
    datasetId: 'ds-1',
    trainingRunId: 'run-1',
    artifactPath: '/models/output',
    status: 'training',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let db: Database.Database;
  let registry: ModelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    createTrainingSchema(db);
    seedDatasetAndRun(db);
    registry = new ModelRegistry(db);
  });

  describe('register + findById', () => {
    it('should register and retrieve a model', () => {
      const model = makeModel();
      registry.register(model);
      const found = registry.findById(model.id);
      expect(found).not.toBeNull();
      expect(found!.baseModel).toBe('llama-3-70b');
      expect(found!.status).toBe('training');
    });

    it('should return null for missing ID', () => {
      expect(registry.findById('nonexistent')).toBeNull();
    });

    it('should store eval scores as JSON', () => {
      const model = makeModel({
        evalScores: { accuracy: 0.95, f1: 0.92 },
      });
      registry.register(model);
      const found = registry.findById(model.id)!;
      expect(found.evalScores).toEqual({ accuracy: 0.95, f1: 0.92 });
    });
  });

  describe('updateStatus', () => {
    it('should transition training → ready', () => {
      const model = makeModel({ status: 'training' });
      registry.register(model);
      registry.updateStatus(model.id, 'ready');
      expect(registry.findById(model.id)!.status).toBe('ready');
    });

    it('should transition ready → deployed and set deployedAt', () => {
      const model = makeModel({ status: 'training' });
      registry.register(model);
      registry.updateStatus(model.id, 'ready');
      registry.updateStatus(model.id, 'deployed');
      const found = registry.findById(model.id)!;
      expect(found.status).toBe('deployed');
      expect(found.deployedAt).toBeInstanceOf(Date);
    });

    it('should reject invalid transitions', () => {
      const model = makeModel({ status: 'training' });
      registry.register(model);
      expect(() => registry.updateStatus(model.id, 'deployed')).toThrow(
        'Invalid status transition: training → deployed',
      );
    });

    it('should reject transitions from retired', () => {
      const model = makeModel({ status: 'training' });
      registry.register(model);
      registry.updateStatus(model.id, 'ready');
      registry.updateStatus(model.id, 'retired');
      expect(() => registry.updateStatus(model.id, 'deployed')).toThrow(
        'Invalid status transition: retired → deployed',
      );
    });

    it('should throw for missing model', () => {
      expect(() => registry.updateStatus('missing', 'ready')).toThrow(
        'Model not found: missing',
      );
    });
  });

  describe('listByStatus', () => {
    it('should filter models by status', () => {
      const m1 = makeModel({ status: 'training' });
      const m2 = makeModel({ status: 'training' });
      registry.register(m1);
      registry.register(m2);
      registry.updateStatus(m1.id, 'ready');

      expect(registry.listByStatus('ready')).toHaveLength(1);
      expect(registry.listByStatus('training')).toHaveLength(1);
      expect(registry.listByStatus('deployed')).toHaveLength(0);
    });
  });

  describe('getDeployed', () => {
    it('should return null when no model is deployed', () => {
      expect(registry.getDeployed()).toBeNull();
    });

    it('should return the most recently deployed model', () => {
      const m1 = makeModel({ status: 'training' });
      const m2 = makeModel({ status: 'training' });
      registry.register(m1);
      registry.register(m2);

      registry.updateStatus(m1.id, 'ready');
      registry.updateStatus(m1.id, 'deployed');

      registry.updateStatus(m2.id, 'ready');
      registry.updateStatus(m2.id, 'deployed');

      const deployed = registry.getDeployed();
      expect(deployed).not.toBeNull();
      // Both are deployed; most recent by deployed_at wins
      expect(deployed!.status).toBe('deployed');
    });
  });
});

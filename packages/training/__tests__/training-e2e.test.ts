/**
 * End-to-end training feedback loop verification test.
 * Uses real SQLite, seeds from fixture JSONL, runs the full orchestrator pipeline,
 * and verifies model registration, status transitions, and history recording.
 * @module training-e2e
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createTrainingSchema } from '../src/schema.js';
import { DatasetRegistry } from '../src/dataset-registry.js';
import { ModelRegistry } from '../src/model-registry.js';
import { RetrainingOrchestrator } from '../src/retraining-orchestrator.js';
import type { EvalRunner } from '../src/retraining-orchestrator.js';
import { RetrainingHistory } from '../src/retraining-history.js';
import type { LocalTrainer } from '../src/local-trainer.js';
import type { DatasetVersion, ModelArtifact, TrainingConfig } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SFT_FIXTURE = join(__dirname, '..', '..', '..', 'eval', 'fixtures', 'acme-training', 'sft-pairs.jsonl');

// ── helpers ──────────────────────────────────────────────────────────

interface SftPair {
  instruction: string;
  response: string;
}

/** Load SFT pairs from the fixture JSONL file. */
function loadSftPairs(): SftPair[] {
  const raw = readFileSync(SFT_FIXTURE, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SftPair);
}

/** Create a mock LocalTrainer that returns a fake artifact. */
function makeMockTrainer(): LocalTrainer {
  return {
    train: vi.fn().mockResolvedValue({
      path: '/tmp/fake-model-artifact',
      format: 'lora',
      baseModel: 'test-base-model',
      sizeBytes: 4096,
    } satisfies ModelArtifact),
    timeoutMs: 60_000,
    maxMemoryMb: 512,
  } as unknown as LocalTrainer;
}

/** Create a mock EvalRunner that returns passing scores. */
function makeMockEvalRunner(passed = true): EvalRunner {
  return {
    runAndGate: vi.fn().mockResolvedValue({
      passed,
      scores: { accuracy: 0.92, semanticSimilarity: 0.88, factualCorrectness: 0.95 },
    }),
  };
}

/** Seed the dataset registry with a version derived from SFT fixture pairs. */
function seedDataset(
  registry: DatasetRegistry,
  pairCount: number,
  sftCount: number,
): DatasetVersion {
  const version: DatasetVersion = {
    id: crypto.randomUUID(),
    version: '1.0.0',
    dataPath: SFT_FIXTURE,
    nodeCount: pairCount + sftCount,
    preferencePairCount: pairCount,
    sftEntryCount: sftCount,
    evalItemCount: 10,
    lineage: { sourceType: 'refine_export', refinedAt: new Date() },
    createdAt: new Date(),
  };
  registry.create(version);
  return version;
}

/** Standard training config for tests. */
function makeConfig(datasetId: string): TrainingConfig {
  return {
    datasetId,
    baseModel: 'test-base-model',
    method: 'dpo',
    provider: 'local',
  };
}

// ── tests ────────────────────────────────────────────────────────────

describe('training feedback loop e2e', () => {
  let db: Database.Database;
  let datasetRegistry: DatasetRegistry;
  let modelRegistry: ModelRegistry;
  let history: RetrainingHistory;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    createTrainingSchema(db);
    datasetRegistry = new DatasetRegistry(db);
    modelRegistry = new ModelRegistry(db);
    history = new RetrainingHistory(db);
  });

  describe('fixture loading', () => {
    it('loads SFT pairs from the JSONL fixture', () => {
      const pairs = loadSftPairs();
      expect(pairs.length).toBeGreaterThanOrEqual(10);
      for (const pair of pairs) {
        expect(typeof pair.instruction).toBe('string');
        expect(typeof pair.response).toBe('string');
        expect(pair.instruction.length).toBeGreaterThan(0);
        expect(pair.response.length).toBeGreaterThan(0);
      }
    });
  });

  describe('full retrain cycle with force=true', () => {
    it('trains, evaluates, registers, and auto-promotes a model', async () => {
      const pairs = loadSftPairs();
      const ds = seedDataset(datasetRegistry, pairs.length, pairs.length);
      const trainer = makeMockTrainer();
      const evalRunner = makeMockEvalRunner(true);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, trainer, evalRunner,
        { autoPromote: true },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.newModelId).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.scores!['accuracy']).toBeGreaterThan(0.8);

      // Verify trainer was called with the dataset path
      expect(trainer.train).toHaveBeenCalledWith(
        expect.objectContaining({ baseModel: 'test-base-model' }),
        SFT_FIXTURE,
      );

      // Verify eval runner was called
      expect(evalRunner.runAndGate).toHaveBeenCalled();
    });

    it('registers the model in SQLite with deployed status', async () => {
      const pairs = loadSftPairs();
      const ds = seedDataset(datasetRegistry, pairs.length, pairs.length);
      const trainer = makeMockTrainer();
      const evalRunner = makeMockEvalRunner(true);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, trainer, evalRunner,
        { autoPromote: true },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });
      const model = modelRegistry.findById(result.newModelId!);

      expect(model).not.toBeNull();
      expect(model!.status).toBe('deployed');
      expect(model!.baseModel).toBe('test-base-model');
      expect(model!.artifactPath).toBe('/tmp/fake-model-artifact');
      expect(model!.deployedAt).toBeDefined();
      expect(model!.evalScores).toEqual({
        accuracy: 0.92,
        semanticSimilarity: 0.88,
        factualCorrectness: 0.95,
      });
    });

    it('records retraining history on success', async () => {
      const pairs = loadSftPairs();
      const ds = seedDataset(datasetRegistry, pairs.length, pairs.length);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, makeMockTrainer(), makeMockEvalRunner(true),
        { autoPromote: true },
        history,
      );

      await orchestrator.retrain(makeConfig(ds.id), { force: true });

      const latest = history.getLatest();
      expect(latest).not.toBeNull();
      expect(latest!.passed).toBe(true);
      expect(latest!.triggeredBy).toBe('force');
      expect(latest!.baseModel).toBe('test-base-model');
      expect(latest!.modelId).toBeDefined();
      expect(history.count()).toBe(1);
    });
  });

  describe('eval gate failure', () => {
    it('does not register model when eval fails', async () => {
      const ds = seedDataset(datasetRegistry, 200, 100);
      const evalRunner = makeMockEvalRunner(false);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, makeMockTrainer(), evalRunner,
        { autoPromote: true },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.newModelId).toBeUndefined();
      expect(modelRegistry.getDeployed()).toBeNull();

      // History should still record the failure
      const latest = history.getLatest();
      expect(latest).not.toBeNull();
      expect(latest!.passed).toBe(false);
      expect(latest!.reason).toContain('Eval gate failed');
    });
  });

  describe('status transitions', () => {
    it('model transitions from ready to deployed via auto-promote', async () => {
      const ds = seedDataset(datasetRegistry, 200, 100);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, makeMockTrainer(), makeMockEvalRunner(true),
        { autoPromote: true },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });
      const model = modelRegistry.findById(result.newModelId!);

      expect(model!.status).toBe('deployed');
      expect(result.reason).toContain('deployed');
    });

    it('model stays ready when autoPromote is false', async () => {
      const ds = seedDataset(datasetRegistry, 200, 100);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, makeMockTrainer(), makeMockEvalRunner(true),
        { autoPromote: false },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });
      const model = modelRegistry.findById(result.newModelId!);

      expect(model!.status).toBe('ready');
      expect(result.reason).toContain('ready');
    });

    it('deployed model can be retired', async () => {
      const ds = seedDataset(datasetRegistry, 200, 100);

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, makeMockTrainer(), makeMockEvalRunner(true),
        { autoPromote: true },
        history,
      );

      const result = await orchestrator.retrain(makeConfig(ds.id), { force: true });
      modelRegistry.updateStatus(result.newModelId!, 'retired');

      const model = modelRegistry.findById(result.newModelId!);
      expect(model!.status).toBe('retired');
    });
  });

  describe('SFT threshold auto-selection', () => {
    it('forces SFT method when pairs below threshold', async () => {
      const ds = seedDataset(datasetRegistry, 30, 30);
      const trainer = makeMockTrainer();

      const orchestrator = new RetrainingOrchestrator(
        datasetRegistry, modelRegistry, trainer, makeMockEvalRunner(true),
        { sftOnlyThreshold: 50, autoPromote: true },
        history,
      );

      await orchestrator.retrain(makeConfig(ds.id), { force: true });

      expect(trainer.train).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'sft' }),
        expect.any(String),
      );
    });
  });
});

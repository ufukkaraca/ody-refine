import { describe, it, expect, vi } from 'vitest';
import { RetrainingOrchestrator, DEFAULT_POLICY } from '../src/retraining-orchestrator.js';
import type { EvalRunner } from '../src/retraining-orchestrator.js';
import type { DatasetRegistry } from '../src/dataset-registry.js';
import type { ModelRegistry } from '../src/model-registry.js';
import type { LocalTrainer } from '../src/local-trainer.js';
import type { DatasetVersion, RegisteredModel, ModelArtifact } from '../src/types.js';
import type { RetrainingHistory } from '../src/retraining-history.js';

function makeDataset(overrides: Partial<DatasetVersion> = {}): DatasetVersion {
  return {
    id: 'ds-1',
    version: '1.0',
    dataPath: '/data/train.jsonl',
    nodeCount: 50,
    preferencePairCount: 150,
    sftEntryCount: 0,
    evalItemCount: 20,
    lineage: { sourceType: 'refine_export' },
    createdAt: new Date('2026-03-01'),
    ...overrides,
  };
}

function makeModel(overrides: Partial<RegisteredModel> = {}): RegisteredModel {
  return {
    id: 'model-1',
    baseModel: 'test-model',
    datasetId: 'ds-1',
    trainingRunId: 'run-1',
    artifactPath: '/models/v1',
    status: 'deployed',
    deployedAt: new Date('2026-03-10'),
    createdAt: new Date('2026-03-10'),
    ...overrides,
  };
}

function createMocks(): {
  registry: DatasetRegistry;
  modelRegistry: ModelRegistry;
  trainer: LocalTrainer;
  evalRunner: EvalRunner;
  history: RetrainingHistory;
} {
  return {
    registry: {
      list: vi.fn().mockReturnValue([makeDataset()]),
      findById: vi.fn().mockReturnValue(makeDataset()),
    } as unknown as DatasetRegistry,
    modelRegistry: {
      getDeployed: vi.fn().mockReturnValue(makeModel()),
      register: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as ModelRegistry,
    trainer: {
      train: vi.fn().mockResolvedValue({
        path: '/models/v2',
        format: 'lora',
        baseModel: 'test-model',
        sizeBytes: 1000,
      } satisfies ModelArtifact),
    } as unknown as LocalTrainer,
    evalRunner: {
      runAndGate: vi.fn().mockResolvedValue({
        passed: true,
        scores: { accuracy: 0.85, semanticSimilarity: 0.8 },
      }),
    } as EvalRunner,
    history: {
      record: vi.fn(),
      getLatest: vi.fn().mockReturnValue(null),
      hoursSinceLastTraining: vi.fn().mockReturnValue(Infinity),
      list: vi.fn().mockReturnValue([]),
      count: vi.fn().mockReturnValue(0),
    } as unknown as RetrainingHistory,
  };
}

describe('RetrainingOrchestrator', () => {
  describe('shouldRetrain', () => {
    it('should return false when pair count is below threshold', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      expect(orch.shouldRetrain(50, null)).toBe(false);
    });

    it('should return true when pairs exceed threshold and no prior training', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      expect(orch.shouldRetrain(150, null)).toBe(true);
    });

    it('should return false during cooldown period', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      const recentlyTrained = new Date(Date.now() - 1000);
      expect(orch.shouldRetrain(150, recentlyTrained)).toBe(false);
    });

    it('should return true after cooldown expires', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      expect(orch.shouldRetrain(150, longAgo)).toBe(true);
    });

    it('should respect custom policy minNewPairs', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
        { minNewPairs: 10 },
      );
      expect(orch.shouldRetrain(15, null)).toBe(true);
    });
  });

  describe('getRetrainDecision', () => {
    it('returns a detailed decision object', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      const decision = orch.getRetrainDecision(150, 48);
      expect(decision.shouldRetrain).toBe(true);
      expect(decision.pairCount).toBe(150);
      expect(decision.sinceLastTraining).toBe(48);
    });

    it('returns not-ready when below threshold', () => {
      const mocks = createMocks();
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );
      const decision = orch.getRetrainDecision(30, 12);
      expect(decision.shouldRetrain).toBe(false);
      expect(decision.reason).toBeDefined();
    });
  });

  describe('retrain', () => {
    it('should return not-triggered when below threshold', async () => {
      const mocks = createMocks();
      (mocks.registry.list as ReturnType<typeof vi.fn>).mockReturnValue([
        makeDataset({ preferencePairCount: 10 }),
      ]);
      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.triggered).toBe(false);
      expect(result.trained).toBe(false);
    });

    it('should run full pipeline and register model on success', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.newModelId).toBeDefined();
      expect(mocks.modelRegistry.register).toHaveBeenCalled();
    });

    it('should not register model when eval gate fails', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );
      (mocks.evalRunner.runAndGate as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        scores: { accuracy: 0.5 },
      });

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.newModelId).toBeUndefined();
      expect(mocks.modelRegistry.register).not.toHaveBeenCalled();
    });

    it('should handle training failure gracefully', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );
      (mocks.trainer.train as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GPU out of memory'),
      );

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(false);
      expect(result.reason).toContain('GPU out of memory');
    });

    it('should return not-trained when no dataset exists', async () => {
      const mocks = createMocks();
      (mocks.registry.list as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(false);
      expect(result.reason).toContain('No dataset');
    });

    it('should force retrain even when below threshold', async () => {
      const mocks = createMocks();
      (mocks.registry.list as ReturnType<typeof vi.fn>).mockReturnValue([
        makeDataset({ preferencePairCount: 10 }),
      ]);
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 1000) }),
      );

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain(
        { datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local' },
        { force: true },
      );

      expect(result.triggered).toBe(true);
      expect(result.trained).toBe(true);
      expect(result.passed).toBe(true);
    });

    it('should record history on successful retrain', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
        undefined,
        mocks.history,
      );

      await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(mocks.history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          baseModel: 'test',
          triggeredBy: 'auto',
        }),
      );
    });

    it('should record history on eval failure', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );
      (mocks.evalRunner.runAndGate as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        scores: { accuracy: 0.5 },
      });

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
        undefined,
        mocks.history,
      );

      await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(mocks.history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          reason: 'Eval gate failed',
        }),
      );
    });

    it('should include decision in result', async () => {
      const mocks = createMocks();
      (mocks.modelRegistry.getDeployed as ReturnType<typeof vi.fn>).mockReturnValue(
        makeModel({ deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      );

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      );

      const result = await orch.retrain({
        datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local',
      });

      expect(result.decision).toBeDefined();
      expect(result.decision?.pairCount).toBe(150);
    });

    it('should set triggeredBy to force when force option used', async () => {
      const mocks = createMocks();
      (mocks.registry.list as ReturnType<typeof vi.fn>).mockReturnValue([
        makeDataset({ preferencePairCount: 10 }),
      ]);

      const orch = new RetrainingOrchestrator(
        mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
        undefined,
        mocks.history,
      );

      await orch.retrain(
        { datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local' },
        { force: true },
      );

      expect(mocks.history.record).toHaveBeenCalledWith(
        expect.objectContaining({ triggeredBy: 'force' }),
      );
    });
  });

  describe('DEFAULT_POLICY', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_POLICY.minNewPairs).toBe(100);
      expect(DEFAULT_POLICY.cooldownMs).toBe(24 * 60 * 60 * 1000);
      expect(DEFAULT_POLICY.replayBufferRatio).toBe(0.2);
      expect(DEFAULT_POLICY.maxTrainingTimeMs).toBe(5 * 60 * 1000);
    });
  });
});

/**
 * Tests that the retraining orchestrator auto-promotes models from 'ready' to 'deployed'
 * after eval gate passes. Validates the P1-1 fix.
 */
import { describe, it, expect, vi } from 'vitest';
import { RetrainingOrchestrator } from '../src/retraining-orchestrator.js';
import type { EvalRunner } from '../src/retraining-orchestrator.js';
import type { DatasetRegistry } from '../src/dataset-registry.js';
import type { ModelRegistry } from '../src/model-registry.js';
import type { LocalTrainer } from '../src/local-trainer.js';
import type { DatasetVersion, RegisteredModel, ModelArtifact } from '../src/types.js';

function makeDataset(overrides: Partial<DatasetVersion> = {}): DatasetVersion {
  return {
    id: 'ds-1', version: '1.0', dataPath: '/data/train.jsonl',
    nodeCount: 50, preferencePairCount: 150, sftEntryCount: 0, evalItemCount: 20,
    lineage: { sourceType: 'refine_export' }, createdAt: new Date('2026-03-01'),
    ...overrides,
  };
}

function makeMocks(): {
  registry: DatasetRegistry;
  modelRegistry: ModelRegistry;
  trainer: LocalTrainer;
  evalRunner: EvalRunner;
} {
  return {
    registry: {
      list: vi.fn().mockReturnValue([makeDataset()]),
      findById: vi.fn().mockReturnValue(makeDataset()),
    } as unknown as DatasetRegistry,
    modelRegistry: {
      getDeployed: vi.fn().mockReturnValue({
        id: 'model-1', baseModel: 'test', datasetId: 'ds-1',
        trainingRunId: 'run-1', artifactPath: '/models/v1', status: 'deployed',
        deployedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      } satisfies RegisteredModel),
      register: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as ModelRegistry,
    trainer: {
      train: vi.fn().mockResolvedValue({
        path: '/models/v2', format: 'lora', baseModel: 'test', sizeBytes: 1000,
      } satisfies ModelArtifact),
    } as unknown as LocalTrainer,
    evalRunner: {
      runAndGate: vi.fn().mockResolvedValue({
        passed: true, scores: { accuracy: 0.85 },
      }),
    } as EvalRunner,
  };
}

describe('auto-promote after eval gate pass (P1-1)', () => {
  it('auto-promotes model from ready to deployed by default', async () => {
    const mocks = makeMocks();
    const orch = new RetrainingOrchestrator(
      mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
    );

    const result = await orch.retrain(
      { datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local' },
    );

    expect(result.passed).toBe(true);
    expect(mocks.modelRegistry.register).toHaveBeenCalled();
    // Should call updateStatus to promote from ready to deployed
    expect(mocks.modelRegistry.updateStatus).toHaveBeenCalledWith(
      result.newModelId,
      'deployed',
    );
    expect(result.reason).toContain('deployed');
  });

  it('does NOT auto-promote when autoPromote is false', async () => {
    const mocks = makeMocks();
    const orch = new RetrainingOrchestrator(
      mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
      { autoPromote: false },
    );

    const result = await orch.retrain(
      { datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local' },
    );

    expect(result.passed).toBe(true);
    expect(mocks.modelRegistry.register).toHaveBeenCalled();
    // Should NOT call updateStatus
    expect(mocks.modelRegistry.updateStatus).not.toHaveBeenCalled();
    expect(result.reason).toContain('ready');
  });

  it('does not promote when eval gate fails', async () => {
    const mocks = makeMocks();
    (mocks.evalRunner.runAndGate as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false, scores: { accuracy: 0.5 },
    });

    const orch = new RetrainingOrchestrator(
      mocks.registry, mocks.modelRegistry, mocks.trainer, mocks.evalRunner,
    );

    const result = await orch.retrain(
      { datasetId: 'ds-1', baseModel: 'test', method: 'dpo', provider: 'local' },
    );

    expect(result.passed).toBe(false);
    expect(mocks.modelRegistry.register).not.toHaveBeenCalled();
    expect(mocks.modelRegistry.updateStatus).not.toHaveBeenCalled();
  });
});

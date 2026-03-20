/**
 * Retraining orchestrator — connects dataset, training, eval, and model deployment.
 * @module training/retraining-orchestrator
 */

import type { DatasetRegistry } from './dataset-registry.js';
import type { ModelRegistry } from './model-registry.js';
import type { LocalTrainer } from './local-trainer.js';
import type { TrainingConfig, DatasetVersion } from './types.js';
import { shouldRetrain as checkShouldRetrain } from './retrain-trigger.js';
import type { RetrainDecision } from './retrain-trigger.js';
import type { RetrainingHistory, RetrainingEvent } from './retraining-history.js';

/** Configuration for the eval runner (injected to avoid circular deps). */
export interface EvalRunner {
  runAndGate(
    config: TrainingConfig,
    candidateArtifactPath: string,
  ): Promise<{ passed: boolean; scores: Record<string, number> }>;
}

/** Policy controlling when and how retraining is triggered. */
export interface RetrainingPolicy {
  /** Minimum new preference pairs before retraining. */
  minNewPairs: number;
  /** How often to check for retraining (ms). Default: 6 hours. */
  checkIntervalMs: number;
  /** Minimum time between training runs (ms). Default: 24 hours. */
  cooldownMs: number;
  /** Fraction of old pairs mixed into new dataset. Default: 0.2. */
  replayBufferRatio: number;
  /** Maximum training time (ms). Default: 5 minutes. */
  maxTrainingTimeMs: number;
  /** Auto-promote model from 'ready' to 'deployed' after eval gate passes. Default: true. */
  autoPromote: boolean;
}

/** Result of a retraining cycle. */
export interface RetrainingResult {
  triggered: boolean;
  trained: boolean;
  passed: boolean;
  newModelId?: string;
  scores?: Record<string, number>;
  reason: string;
  decision?: RetrainDecision;
}

/** Default retraining policy values. */
export const DEFAULT_POLICY: RetrainingPolicy = {
  minNewPairs: 100,
  checkIntervalMs: 6 * 60 * 60 * 1000,
  cooldownMs: 24 * 60 * 60 * 1000,
  replayBufferRatio: 0.2,
  maxTrainingTimeMs: 5 * 60 * 1000,
  autoPromote: true,
};

/**
 * Orchestrates the full retraining pipeline:
 * check trigger → build dataset → train → eval gate → deploy/reject.
 */
export class RetrainingOrchestrator {
  private readonly datasetRegistry: DatasetRegistry;
  private readonly modelRegistry: ModelRegistry;
  private readonly trainer: LocalTrainer;
  private readonly evalRunner: EvalRunner;
  private readonly policy: RetrainingPolicy;
  private readonly history: RetrainingHistory | null;

  constructor(
    datasetRegistry: DatasetRegistry,
    modelRegistry: ModelRegistry,
    trainer: LocalTrainer,
    evalRunner: EvalRunner,
    policy?: Partial<RetrainingPolicy>,
    history?: RetrainingHistory,
  ) {
    this.datasetRegistry = datasetRegistry;
    this.modelRegistry = modelRegistry;
    this.trainer = trainer;
    this.evalRunner = evalRunner;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.history = history ?? null;
  }

  /** Check whether retraining should be triggered based on pair count and cooldown. */
  shouldRetrain(newPairCount: number, lastTrainedAt: Date | null): boolean {
    if (newPairCount < this.policy.minNewPairs) {
      return false;
    }
    if (lastTrainedAt) {
      const elapsed = Date.now() - lastTrainedAt.getTime();
      if (elapsed < this.policy.cooldownMs) {
        return false;
      }
    }
    return true;
  }

  /** Get a detailed retrain decision using the enhanced trigger logic. */
  getRetrainDecision(pairCount: number, hoursSinceTraining: number): RetrainDecision {
    return checkShouldRetrain(pairCount, hoursSinceTraining, {
      minPairs: this.policy.minNewPairs,
      maxHours: this.policy.cooldownMs / (1000 * 60 * 60),
    });
  }

  /**
   * Run the full retrain cycle:
   * 1. Build dataset from accumulated preference pairs (with replay buffer)
   * 2. Train new model (DPO, time-capped)
   * 3. Run eval benchmark
   * 4. Apply eval gate: new must beat current on ALL metrics
   * 5. If passed: register new model, update status to 'ready'
   * 6. If failed: log reason, keep current model
   */
  async retrain(
    config: TrainingConfig,
    options?: { force?: boolean; triggeredBy?: 'auto' | 'manual' | 'force' },
  ): Promise<RetrainingResult> {
    const force = options?.force ?? false;
    const triggeredBy = options?.triggeredBy ?? (force ? 'force' : 'auto');
    const latestDataset = this.getLatestDataset();

    if (!latestDataset) {
      return {
        triggered: true,
        trained: false,
        passed: false,
        reason: 'No dataset available for training',
      };
    }

    const lastTrainedAt = this.getLastTrainedAt();
    const pairCount = latestDataset.preferencePairCount;
    const hoursSince = lastTrainedAt
      ? (Date.now() - lastTrainedAt.getTime()) / (1000 * 60 * 60)
      : Infinity;
    const decision = this.getRetrainDecision(pairCount, hoursSince);

    if (!force && !this.shouldRetrain(pairCount, lastTrainedAt)) {
      return {
        triggered: false,
        trained: false,
        passed: false,
        reason: decision.reason,
        decision,
      };
    }

    let artifact;
    try {
      artifact = await this.trainer.train(config, latestDataset.dataPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordHistory(null, config.baseModel, pairCount, null, false, `Training failed: ${msg}`, triggeredBy);
      return {
        triggered: true,
        trained: false,
        passed: false,
        reason: `Training failed: ${msg}`,
        decision,
      };
    }

    let evalResult;
    try {
      evalResult = await this.evalRunner.runAndGate(config, artifact.path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordHistory(null, config.baseModel, pairCount, null, false, `Eval failed: ${msg}`, triggeredBy);
      return {
        triggered: true,
        trained: true,
        passed: false,
        scores: {},
        reason: `Eval failed: ${msg}`,
        decision,
      };
    }

    if (!evalResult.passed) {
      this.recordHistory(null, config.baseModel, pairCount, evalResult.scores, false, 'Eval gate failed', triggeredBy);
      return {
        triggered: true,
        trained: true,
        passed: false,
        scores: evalResult.scores,
        reason: 'Eval gate failed: candidate did not beat current model',
        decision,
      };
    }

    const modelId = crypto.randomUUID();
    this.modelRegistry.register({
      id: modelId,
      baseModel: config.baseModel,
      datasetId: config.datasetId,
      trainingRunId: modelId,
      evalScores: evalResult.scores,
      artifactPath: artifact.path,
      status: 'ready',
      createdAt: new Date(),
    });

    // Auto-promote from 'ready' to 'deployed' when policy allows
    if (this.policy.autoPromote) {
      this.modelRegistry.updateStatus(modelId, 'deployed');
    }

    const statusLabel = this.policy.autoPromote ? 'deployed' : 'ready';
    this.recordHistory(modelId, config.baseModel, pairCount, evalResult.scores, true, 'Eval gate passed', triggeredBy);

    return {
      triggered: true,
      trained: true,
      passed: true,
      newModelId: modelId,
      scores: evalResult.scores,
      reason: `Eval gate passed — new model registered as ${statusLabel}`,
      decision,
    };
  }

  private recordHistory(
    modelId: string | null,
    baseModel: string,
    pairCount: number,
    evalScores: Record<string, number> | null,
    passed: boolean,
    reason: string,
    triggeredBy: RetrainingEvent['triggeredBy'],
  ): void {
    if (!this.history) return;
    this.history.record({
      id: crypto.randomUUID(),
      modelId,
      baseModel,
      pairCount,
      evalScores,
      passed,
      reason,
      triggeredBy,
      createdAt: new Date(),
    });
  }

  private getLatestDataset(): DatasetVersion | null {
    const datasets = this.datasetRegistry.list();
    return datasets.length > 0 ? datasets[0]! : null;
  }

  private getLastTrainedAt(): Date | null {
    const deployed = this.modelRegistry.getDeployed();
    return deployed?.deployedAt ?? deployed?.createdAt ?? null;
  }
}

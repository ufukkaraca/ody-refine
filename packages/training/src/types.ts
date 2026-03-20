/**
 * All interfaces for the @ody/training package.
 * @module training/types
 */

/** Configuration for a training run. */
export interface TrainingConfig {
  datasetId: string;
  baseModel: string;
  method: 'sft' | 'dpo' | 'grpo';
  provider: 'local' | 'modal' | 'prime-intellect';
  compute?: { gpuType?: string; nodeCount?: number };
  hyperparams?: {
    learningRate?: number;
    epochs?: number;
    batchSize?: number;
    warmupSteps?: number;
  };
}

/** Status of a training run. */
export type TrainingStatus =
  | 'pending'
  | 'preparing'
  | 'training'
  | 'evaluating'
  | 'completed'
  | 'failed';

/** Status of a registered model. */
export type ModelStatus = 'training' | 'ready' | 'deployed' | 'retired';

/** Lineage information for a dataset version. */
export interface DatasetLineage {
  parentVersionId?: string;
  sourceType: 'refine_export' | 'manual_upload' | 'incremental';
  refinedAt?: Date;
  nodeFilter?: Record<string, unknown>;
}

/** A versioned snapshot of a training dataset. */
export interface DatasetVersion {
  id: string;
  version: string;
  dataPath: string;
  nodeCount: number;
  preferencePairCount: number;
  sftEntryCount: number;
  evalItemCount: number;
  sourceAuditId?: string;
  lineage: DatasetLineage;
  createdAt: Date;
}

/** A single training run record. */
export interface TrainingRun {
  id: string;
  datasetId: string;
  baseModel: string;
  method: 'sft' | 'dpo' | 'grpo';
  status: TrainingStatus;
  evalScores?: Record<string, number>;
  artifactPath?: string;
  preferencePairCount: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

/** A registered model in the model registry. */
export interface RegisteredModel {
  id: string;
  baseModel: string;
  datasetId: string;
  trainingRunId: string;
  evalScores?: Record<string, number>;
  artifactPath: string;
  status: ModelStatus;
  deployedAt?: Date;
  createdAt: Date;
}

/** A model artifact on disk. */
export interface ModelArtifact {
  path: string;
  format: 'safetensors' | 'gguf' | 'lora';
  baseModel: string;
  sizeBytes: number;
}

/** Metadata written to artifact-meta.json alongside training artifacts. */
export interface ArtifactMeta {
  modelPath: string;
  baseModel: string;
  method: string;
  timestamp: string;
}

/** Orchestrator interface for the full training pipeline. */
export interface TrainingOrchestrator {
  /** Create a new dataset version from source data. */
  createDataset(params: {
    name: string;
    sourcePath: string;
    version?: string;
  }): Promise<DatasetVersion>;

  /** Start a training run with the given config. */
  startTraining(config: TrainingConfig): Promise<TrainingRun>;

  /** Get current status of a training run. */
  getTrainingStatus(runId: string): Promise<TrainingRun>;

  /** Register a trained model artifact. */
  registerModel(
    artifact: ModelArtifact,
    runId: string,
  ): Promise<RegisteredModel>;
}

/**
 * @ody/training — dataset registry, model registry, local trainer, and config.
 * @module @ody/training
 */

export type {
  TrainingConfig,
  TrainingStatus,
  ModelStatus,
  DatasetVersion,
  DatasetLineage,
  TrainingRun,
  RegisteredModel,
  ModelArtifact,
  ArtifactMeta,
  TrainingOrchestrator,
} from './types.js';

export { createTrainingSchema } from './schema.js';
export { DatasetRegistry } from './dataset-registry.js';
export type { DatasetDiff } from './dataset-registry.js';
export { ModelRegistry } from './model-registry.js';
export { LocalTrainer, DEFAULT_TRAINING_TIMEOUT_MS, DEFAULT_MAX_MEMORY_MB } from './local-trainer.js';
export type { TrainerLogger, LocalTrainerOptions } from './local-trainer.js';
export { RemoteTrainer } from './remote-trainer.js';
export type { RemoteTrainerLogger, RemoteTrainerOptions } from './remote-trainer.js';
export { ModalClient } from './modal-client.js';
export type {
  ModalCredentials,
  ModalFunctionStatus,
  ModalFunctionCall,
  ModalFunctionResult,
  ModalClientOptions,
} from './modal-client.js';
export { generateTrainingScript } from './training-config.js';
export { resolveModelForTraining, resolveToHuggingFace, isOllamaTag } from './model-resolver.js';
export { detectDatasetType, analyzeRefineExport } from './dataset-detector.js';
export type { DetectedDatasetType, DatasetAnalysis, InvalidLineDetail } from './dataset-detector.js';
export {
  RetrainingOrchestrator,
  DEFAULT_POLICY,
} from './retraining-orchestrator.js';
export type {
  RetrainingPolicy,
  RetrainingResult,
  EvalRunner,
} from './retraining-orchestrator.js';
export { loadDeployedModel, loadModelById } from './model-loader.js';
export type {
  ModelLoaderLogger,
  LoadModelOptions,
  LoadedModel,
} from './model-loader.js';
export { shouldRetrain, DEFAULT_TRIGGER_OPTIONS } from './retrain-trigger.js';
export type {
  RetrainDecision,
  RetrainTriggerOptions,
} from './retrain-trigger.js';
export { RetrainingHistory } from './retraining-history.js';
export type { RetrainingEvent } from './retraining-history.js';

/**
 * @ody/feedback — interaction signals, reputation tracking, and reward derivation.
 * @module @ody/feedback
 */

export * from './types.js';
export { createFeedbackSchema } from './schema.js';
export { SignalCollector } from './signal-collector.js';
export {
  deriveReward,
  derivePreferencePair,
  derivePreferencePairFromCorrection,
  generateQuestionFromContent,
  generatePromptFromDetection,
  looksLikeUuid,
} from './reward-derivation.js';
export { detectConflictingCorrections } from './conflict-detector.js';
export type { CorrectionConflict } from './conflict-detector.js';
export {
  processCorrection,
  validateCorrection,
} from './correction-pipeline.js';
export type { CorrectionValidation } from './correction-pipeline.js';
export { ReputationTracker } from './reputation.js';
export type { ReputationThreshold } from './reputation.js';
export { PreferencePairStore } from './pair-store.js';

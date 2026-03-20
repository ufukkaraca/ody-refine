/**
 * @ody/eval — benchmark generation, model evaluation, promotion gating,
 * corpus-based testing, consistency measurement, and speed benchmarks.
 * @module @ody/eval
 */

export * from './types.js';
export * from './corpus-types.js';
export { generateBenchmark } from './benchmark.js';
export { runBenchmark, runHeadToHead } from './runner.js';
export type { RunBenchmarkOptions } from './runner.js';
export {
  calculateAccuracy,
  calculateSemanticSimilarity,
  calculateNgramOverlap,
  calculateResolutionRate,
  cosineSimilarity,
  detectContradiction,
} from './metrics.js';
export { compareBenchmarks } from './compare.js';
export { evaluateGate } from './eval-gate.js';
export {
  generateContradictionBenchmark,
  generateScenariosFromNodes,
} from './contradiction-benchmark.js';
export type { ContradictionScenario } from './contradiction-benchmark.js';

// Corpus-based evaluation
export {
  computePrecisionRecallF1,
  evaluateContradictionDetector,
  evaluateStalenessDetector,
} from './corpus-runner.js';

// Fixture loading
export {
  loadContradictionCorpus,
  loadStalenessCorpus,
  loadPreferencePairs,
  loadForgeEvalQuestions,
  loadBaselineQuestions,
} from './fixture-loader.js';

// Consistency measurement
export {
  measureConsistency,
  jaccard,
  detectionKey,
} from './consistency-measure.js';
export type { ConsistencyResult } from './consistency-measure.js';

// Speed benchmarks
export { timeDetector, runSpeedBenchmark } from './speed-benchmark.js';
export type { TimingResult, SpeedBenchmarkResult } from './speed-benchmark.js';

// Preference pair validation
export {
  validatePreferencePairs,
  validateTrlDpoJsonl,
} from './preference-pair-validator.js';
export type {
  PairValidationIssue,
  PairValidationResult,
} from './preference-pair-validator.js';

// Flywheel simulation (structural — does NOT test real model training)
export { runFlywheelTest } from './flywheel-simulation.js';
export type {
  FlywheelScenario,
  StageResult,
  FlywheelResult,
} from './flywheel-simulation.js';

// Baseline evaluation (beats-baseline, eval gate runner)
export {
  forgeQuestionsToBenchmark,
  baselineQuestionsToBenchmark,
  runBaselineComparison,
  runEvalGate,
} from './baseline-eval.js';
export type { BaselineComparisonResult } from './baseline-eval.js';

/**
 * @ody/detectors — pure function detectors for knowledge graph analysis.
 * @module @ody/detectors
 */
export { detectContradictions } from './contradictions.js';
export { detectDuplicates } from './duplicates.js';
export { detectStaleness } from './staleness.js';
export { detectUndocumented } from './undocumented.js';
export { detectTimeBombs } from './time-bombs.js';
export { runDetection } from './run-detection.js';
export type {
  RunDetectionInput,
  RunDetectionOutput,
  DetectorRunStats,
} from './run-detection.js';
export { analyzeCorpus } from './consultant-analysis.js';
export { runConsensusAnalysis } from './consensus.js';
export type { ConsensusOptions } from './consensus.js';
export { computeDeterministicHealthScore } from './health-score.js';
export type {
  FindingCategory,
  ConsultingFinding,
  HealthScore,
  DocumentInfo,
  AnalysisResult,
  AnalysisInput,
} from './consultant-analysis.js';

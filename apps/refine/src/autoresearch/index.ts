/**
 * Autoresearch module — Karpathy-inspired detector optimization loop.
 * @module autoresearch
 */
export { optimize } from './optimize.js';
export type { OptimizeConfig, OptimizeResult, IterationResult } from './optimize.js';
export { loadGroundTruth, scoreDetections } from './ground-truth.js';
export type { GroundTruth, ScoreResult } from './ground-truth.js';
export { DEFAULT_DETECTOR_CONFIG, clampConfig } from './config-space.js';
export type { DetectorConfig, ConfigBounds } from './config-space.js';
export { proposeConfigChanges } from './proposer.js';

/**
 * Detector configuration space — defines what the optimizer can modify.
 * @module autoresearch/config-space
 */
import type { PreFilterConfig } from '@useody/platform-core';

/** Tunable parameters for each detector. */
export interface DetectorConfig {
  contradictions: PreFilterConfig & { maxLlmCalls: number };
  duplicates: PreFilterConfig & { maxLlmCalls: number };
  staleness: PreFilterConfig;
  undocumented: PreFilterConfig;
  timeBombs: PreFilterConfig & { requireAllNodes: boolean };
}

/** Default detector configuration — matches current preFilter defaults. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  contradictions: { similarityThreshold: 0.6, topK: 10, maxLlmCalls: 10 },
  duplicates: { similarityThreshold: 0.75, topK: 5, maxLlmCalls: 5 },
  staleness: { similarityThreshold: 0.5, topK: 15 },
  undocumented: { similarityThreshold: 0.5, topK: 15 },
  timeBombs: { similarityThreshold: 0.5, topK: 15, requireAllNodes: true },
};

/** Constraints on what values the optimizer can propose. */
export interface ConfigBounds {
  similarityThreshold: { min: number; max: number };
  topK: { min: number; max: number };
  maxLlmCalls: { min: number; max: number };
}

/** Default bounds for the optimizer. */
export const DEFAULT_BOUNDS: ConfigBounds = {
  similarityThreshold: { min: 0.3, max: 0.95 },
  topK: { min: 3, max: 30 },
  maxLlmCalls: { min: 1, max: 20 },
};

/** Clamp a config to valid bounds. */
export function clampConfig(
  config: DetectorConfig,
  bounds: ConfigBounds = DEFAULT_BOUNDS,
): DetectorConfig {
  const clampNum = (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v));

  const clampPre = (
    pre: PreFilterConfig & { maxLlmCalls?: number },
  ): PreFilterConfig & { maxLlmCalls?: number } => ({
    ...pre,
    similarityThreshold: clampNum(
      pre.similarityThreshold,
      bounds.similarityThreshold.min,
      bounds.similarityThreshold.max,
    ),
    topK: Math.round(clampNum(pre.topK, bounds.topK.min, bounds.topK.max)),
    ...(pre.maxLlmCalls !== undefined
      ? {
          maxLlmCalls: Math.round(
            clampNum(pre.maxLlmCalls, bounds.maxLlmCalls.min, bounds.maxLlmCalls.max),
          ),
        }
      : {}),
  });

  return {
    contradictions: clampPre(config.contradictions) as DetectorConfig['contradictions'],
    duplicates: clampPre(config.duplicates) as DetectorConfig['duplicates'],
    staleness: clampPre(config.staleness),
    undocumented: clampPre(config.undocumented),
    timeBombs: {
      ...clampPre(config.timeBombs),
      requireAllNodes: config.timeBombs.requireAllNodes,
    } as DetectorConfig['timeBombs'],
  };
}

/**
 * Benchmark comparison — delta analysis between two eval runs.
 * @module eval/compare
 */

import type { EvalResult, ComparisonReport } from './types.js';

/** Metrics where higher is better. */
const HIGHER_IS_BETTER = ['accuracy', 'semanticSimilarity', 'avgConfidence'];

/** Metrics where lower is better. */
const LOWER_IS_BETTER = ['contradictionRate'];

/**
 * Compare two eval results and produce a comparison report.
 * Candidate wins only if it has no regressions.
 */
export function compareBenchmarks(
  current: EvalResult,
  candidate: EvalResult,
): ComparisonReport {
  const metrics = [
    ...HIGHER_IS_BETTER,
    ...LOWER_IS_BETTER,
  ] as (keyof EvalResult['scores'])[];

  const deltas: Record<string, number> = {};
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const metric of metrics) {
    const currentVal = current.scores[metric];
    const candidateVal = candidate.scores[metric];
    const delta = candidateVal - currentVal;
    deltas[metric] = delta;

    const isLowerBetter = LOWER_IS_BETTER.includes(metric);

    if (isLowerBetter) {
      if (delta > 0) regressions.push(metric);
      else if (delta < 0) improvements.push(metric);
    } else {
      if (delta < 0) regressions.push(metric);
      else if (delta > 0) improvements.push(metric);
    }
  }

  const winner =
    regressions.length === 0 && improvements.length > 0
      ? candidate.modelId
      : regressions.length > 0
        ? current.modelId
        : null;

  return {
    models: [current.modelId, candidate.modelId],
    winner,
    deltas,
    regressions,
    improvements,
  };
}

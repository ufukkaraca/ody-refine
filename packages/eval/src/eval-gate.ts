/**
 * Eval gate — hard pass/fail check for model promotion.
 * @module eval/eval-gate
 */

import type { EvalResult, EvalGateResult } from './types.js';

/** Metrics where higher is better (candidate must be >= current). */
const HIGHER_IS_BETTER: (keyof EvalResult['scores'])[] = [
  'accuracy',
  'semanticSimilarity',
  'avgConfidence',
];

/** Metrics where lower is better (candidate must be <= current). */
const LOWER_IS_BETTER: (keyof EvalResult['scores'])[] = [
  'contradictionRate',
];

/**
 * Evaluate whether a candidate model passes the promotion gate.
 * HARD gate: candidate must be >= current on all higher-is-better metrics,
 * and <= current on all lower-is-better metrics.
 */
export function evaluateGate(
  current: EvalResult,
  candidate: EvalResult,
): EvalGateResult {
  const regressions: EvalGateResult['regressions'] = [];

  for (const metric of HIGHER_IS_BETTER) {
    const currentVal = current.scores[metric];
    const candidateVal = candidate.scores[metric];
    if (candidateVal < currentVal) {
      regressions.push({ metric, current: currentVal, candidate: candidateVal });
    }
  }

  for (const metric of LOWER_IS_BETTER) {
    const currentVal = current.scores[metric];
    const candidateVal = candidate.scores[metric];
    if (candidateVal > currentVal) {
      regressions.push({ metric, current: currentVal, candidate: candidateVal });
    }
  }

  const passed = regressions.length === 0;

  const reasoning = passed
    ? 'Candidate passes all gate checks. No regressions detected.'
    : `Candidate fails gate: ${regressions
        .map(
          (r) =>
            `${r.metric} regressed from ${r.current.toFixed(3)} to ${r.candidate.toFixed(3)}`,
        )
        .join('; ')}.`;

  return {
    passed,
    currentModelId: current.modelId,
    candidateModelId: candidate.modelId,
    regressions,
    reasoning,
  };
}

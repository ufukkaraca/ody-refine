/**
 * Deterministic health scoring from findings.
 * Computes health scores without LLM — purely from the set of findings.
 * @module health-score
 */
import type { ConsultingFinding, FindingCategory, HealthScore } from './consultant-analysis.js';

/** Severity penalty points. */
const SEVERITY_PENALTY: Record<string, number> = {
  critical: 25,
  warning: 8,
  info: 3,
};

/** Categories that penalize the consistency dimension. */
const CONSISTENCY_CATEGORIES: ReadonlySet<FindingCategory> = new Set([
  'contradiction',
  'duplicate_truth',
]);

/** Categories that penalize the freshness dimension. */
const FRESHNESS_CATEGORIES: ReadonlySet<FindingCategory> = new Set([
  'stale_commitment',
  'commitment_without_followthrough',
]);

/** Categories that penalize the ownership dimension. */
const OWNERSHIP_CATEGORIES: ReadonlySet<FindingCategory> = new Set([
  'ownership_gap',
  'decision_without_context',
]);

/** Categories that penalize the coverage dimension. */
const COVERAGE_CATEGORIES: ReadonlySet<FindingCategory> = new Set([
  'tribal_knowledge',
]);

/** Clamp a value to the 0-100 range. */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Compute the penalty for a set of findings against a dimension. */
function dimensionScore(
  findings: ReadonlyArray<ConsultingFinding>,
  categories: ReadonlySet<FindingCategory>,
): number {
  let penalty = 0;
  for (const f of findings) {
    if (categories.has(f.category)) {
      penalty += SEVERITY_PENALTY[f.severity] ?? 0;
    }
  }
  return clamp(100 - penalty);
}

/**
 * Compute a deterministic health score from findings.
 * The LLM only identifies findings — this function derives
 * repeatable scores purely from their categories and severities.
 */
export function computeDeterministicHealthScore(
  findings: ReadonlyArray<ConsultingFinding>,
): HealthScore {
  const consistency = dimensionScore(findings, CONSISTENCY_CATEGORIES);
  const freshness = dimensionScore(findings, FRESHNESS_CATEGORIES);
  const ownership = dimensionScore(findings, OWNERSHIP_CATEGORIES);
  const coverage = dimensionScore(findings, COVERAGE_CATEGORIES);

  const overall = clamp(
    consistency * 0.35 + freshness * 0.25 + ownership * 0.2 + coverage * 0.2,
  );

  return { overall, consistency, freshness, ownership, coverage };
}

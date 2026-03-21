/**
 * Shared constants for detector LLM calls.
 * Consolidates timeouts, batch limits, and deduplication helpers
 * previously scattered across claim-comparison, claim-nli, and contradiction-helpers.
 * @module detectors/prompts
 */

/** Timeout for simple pairwise claim comparison (shorter task). */
export const CLAIM_COMPARISON_TIMEOUT_MS = 8_000;

/** Timeout for NLI extraction and comparison (longer task). */
export const NLI_TIMEOUT_MS = 15_000;

/** Max pairwise LLM calls for direct claim comparison. */
export const MAX_CLAIM_COMPARISON_CALLS = 30;

/** Max pairwise LLM calls for NLI comparison stage. */
export const MAX_NLI_CALLS = 100;

/** Batch size for concurrent LLM calls (Promise.all). */
export const LLM_BATCH_SIZE = 5;

/**
 * Canonical pair key for deduplication.
 * Ensures the same pair always produces the same key regardless of argument order.
 */
export function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

import type { SwapType } from '../entities/index.js';

/**
 * Check if two reserves should be linked based on similarity and entity sharing
 */
export interface SwapCandidate {
  reserveAId: string;
  reserveBId: string;
  similarityScore: number; // 0-1 embedding similarity
  sharedEntities: string[]; // common entities mentioned
  suggestedType: SwapType;
  suggestedReason: string;
}

/**
 * Thresholds for automatic swap creation
 */
export const SWAP_THRESHOLDS = {
  // Minimum embedding similarity to consider linking
  minSimilarity: 0.75,

  // Minimum entities shared to create a link
  minSharedEntities: 1,

  // Confidence assigned to auto-created swaps
  autoSwapConfidence: 0.6,
} as const;

/**
 * Determine if a swap should be created between two reserves
 */
export function shouldCreateSwap(candidate: SwapCandidate): boolean {
  // High similarity alone is enough
  if (candidate.similarityScore >= SWAP_THRESHOLDS.minSimilarity) {
    return true;
  }

  // Shared entities with moderate similarity
  if (
    candidate.sharedEntities.length >= SWAP_THRESHOLDS.minSharedEntities &&
    candidate.similarityScore >= 0.5
  ) {
    return true;
  }

  return false;
}

/**
 * Infer swap type from context
 */
export function inferSwapType(
  sharedEntities: string[],
  reserveATitleLower: string,
  reserveBTitleLower: string
): { type: SwapType; reason: string } {
  // Check for person references
  const personKeywords = ['engineer', 'manager', 'lead', 'developer', 'designer'];
  const isPersonA = personKeywords.some((k) => reserveATitleLower.includes(k));
  const isPersonB = personKeywords.some((k) => reserveBTitleLower.includes(k));

  if (isPersonA || isPersonB) {
    return {
      type: 'person_knows',
      reason: `Person mentioned or involved with this topic.`,
    };
  }

  // Check for causal language
  if (
    reserveATitleLower.includes('caused') ||
    reserveATitleLower.includes('result of')
  ) {
    return {
      type: 'caused_by',
      reason: `Causal relationship detected.`,
    };
  }

  // Check for contradiction indicators
  if (
    reserveATitleLower.includes('wrong') ||
    reserveATitleLower.includes('incorrect') ||
    reserveATitleLower.includes('contradict')
  ) {
    return {
      type: 'contradicts',
      reason: `Potential contradiction identified.`,
    };
  }

  // Default to related
  return {
    type: 'related',
    reason:
      sharedEntities.length > 0
        ? `Shared entities: ${sharedEntities.slice(0, 3).join(', ')}.`
        : `Semantic similarity detected.`,
  };
}

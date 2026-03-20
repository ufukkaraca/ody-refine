/**
 * Continuous correction-to-preference-pair pipeline.
 * Every user correction becomes an immediate preference pair for Forge training.
 * @module feedback/correction-pipeline
 */

import type { PreferencePair } from '@useody/platform-core';
import type { PreferencePairStore } from './pair-store.js';
import type { ReputationTracker } from './reputation.js';
import { derivePreferencePairFromCorrection, looksLikeUuid } from './reward-derivation.js';
import type { CorrectionSignal, ReputationScore } from './types.js';

/** Result of a correction pipeline validation. */
export interface CorrectionValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that a correction signal is well-formed and usable.
 * Rejects empty corrections, identical corrections, and UUID-only prompts.
 */
export function validateCorrection(correction: CorrectionSignal): CorrectionValidation {
  const { originalQuestion, originalAnswer, correctedAnswer } = correction;

  if (!originalQuestion.trim()) {
    return { valid: false, reason: 'Original question is empty' };
  }

  if (!originalAnswer.trim()) {
    return { valid: false, reason: 'Original answer is empty' };
  }

  if (!correctedAnswer.trim()) {
    return { valid: false, reason: 'Corrected answer is empty' };
  }

  if (correctedAnswer.trim() === originalAnswer.trim()) {
    return { valid: false, reason: 'Corrected answer is identical to original' };
  }

  if (looksLikeUuid(originalQuestion)) {
    return { valid: false, reason: 'Original question is a UUID, not natural language' };
  }

  return { valid: true };
}

/**
 * Process a single correction into a preference pair and store it.
 * This is the continuous feedback loop: every valid correction from
 * a sufficiently reputable user becomes an immediate training signal.
 *
 * @param correction - The enriched correction signal
 * @param pairStore - Store for persisting preference pairs
 * @param reputationTracker - Tracker for user reputation scores
 * @returns The created preference pair, or null if rejected
 */
export function processCorrection(
  correction: CorrectionSignal,
  pairStore: PreferencePairStore,
  reputationTracker: ReputationTracker,
): PreferencePair | null {
  const validation = validateCorrection(correction);
  if (!validation.valid) {
    return null;
  }

  const reputation = resolveReputation(
    correction.signal.userId,
    reputationTracker,
  );

  const pair = derivePreferencePairFromCorrection(correction, reputation);
  if (!pair) {
    return null;
  }

  pairStore.save(pair);
  return pair;
}

/**
 * Resolve reputation for a user, falling back to a default score
 * if no reputation record exists yet (new users start at 0.5).
 */
function resolveReputation(
  userId: string,
  tracker: ReputationTracker,
): ReputationScore {
  const existing = tracker.getScore(userId);
  if (existing) {
    return existing;
  }

  return {
    userId,
    score: 0.5,
    totalSignals: 0,
    correctCorrections: 0,
    overriddenCorrections: 0,
    lastUpdated: new Date(),
  };
}

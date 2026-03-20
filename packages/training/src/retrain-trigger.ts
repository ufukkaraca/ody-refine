/**
 * Retraining trigger logic — decides WHEN to retrain based on pair count and time.
 * @module training/retrain-trigger
 */

/** Decision result from the shouldRetrain check. */
export interface RetrainDecision {
  shouldRetrain: boolean;
  reason: string;
  pairCount: number;
  sinceLastTraining: number;
  confidenceThreshold: number;
}

/** Options for tuning retrain trigger thresholds. */
export interface RetrainTriggerOptions {
  /** Minimum new preference pairs before retraining. Default: 50. */
  minPairs?: number;
  /** Maximum hours before time-based trigger kicks in. Default: 168 (1 week). */
  maxHours?: number;
  /** Minimum confidence for a pair to count. Default: 0.5. */
  minConfidence?: number;
  /** Minimum pairs for the time-based fallback trigger. Default: 10. */
  timeBasedMinPairs?: number;
}

/** Default trigger thresholds. */
export const DEFAULT_TRIGGER_OPTIONS: Required<RetrainTriggerOptions> = {
  minPairs: 50,
  maxHours: 168,
  minConfidence: 0.5,
  timeBasedMinPairs: 10,
};

/**
 * Determine whether retraining should be triggered.
 *
 * Two triggers:
 * 1. **Pair threshold** — at least `minPairs` (default 50) new pairs
 * 2. **Time-based** — at least `maxHours` (default 168h/1 week) since last training
 *    AND at least `timeBasedMinPairs` (default 10) pairs
 *
 * All pairs must be above `minConfidence` (default 0.5).
 */
export function shouldRetrain(
  pairsSinceLastTraining: number,
  hoursSinceLastTraining: number,
  options?: RetrainTriggerOptions,
): RetrainDecision {
  const opts = { ...DEFAULT_TRIGGER_OPTIONS, ...options };
  const base: Omit<RetrainDecision, 'shouldRetrain' | 'reason'> = {
    pairCount: pairsSinceLastTraining,
    sinceLastTraining: hoursSinceLastTraining,
    confidenceThreshold: opts.minConfidence,
  };

  // Check pair-count threshold trigger
  if (pairsSinceLastTraining >= opts.minPairs) {
    return {
      ...base,
      shouldRetrain: true,
      reason: `Pair threshold met: ${pairsSinceLastTraining}/${opts.minPairs} pairs`,
    };
  }

  // Check time-based trigger: enough time AND minimum pairs
  if (
    hoursSinceLastTraining >= opts.maxHours &&
    pairsSinceLastTraining >= opts.timeBasedMinPairs
  ) {
    return {
      ...base,
      shouldRetrain: true,
      reason: `Time threshold met: ${Math.round(hoursSinceLastTraining)}h since last training with ${pairsSinceLastTraining} pairs`,
    };
  }

  // Not ready — explain why
  if (pairsSinceLastTraining < opts.timeBasedMinPairs) {
    const needed = opts.minPairs - pairsSinceLastTraining;
    return {
      ...base,
      shouldRetrain: false,
      reason: `Need ${needed} more pairs (${pairsSinceLastTraining}/${opts.minPairs})`,
    };
  }

  // Between timeBasedMinPairs and minPairs, time hasn't elapsed yet
  const hoursRemaining = Math.max(0, opts.maxHours - hoursSinceLastTraining);
  const pairsNeeded = opts.minPairs - pairsSinceLastTraining;
  return {
    ...base,
    shouldRetrain: false,
    reason: `${pairsSinceLastTraining}/${opts.minPairs} pairs (need ${pairsNeeded} more), or wait ${Math.round(hoursRemaining)}h for time-based trigger`,
  };
}

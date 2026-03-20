/**
 * Detects conflicting corrections from different users.
 * @module feedback/conflict-detector
 */

import type { InteractionSignal } from './types.js';

/** A pair of corrections that contradict each other. */
export interface CorrectionConflict {
  signalA: InteractionSignal;
  signalB: InteractionSignal;
  overlappingNodeIds: string[];
}

/**
 * Detect conflicting corrections: pairs that reference the same topic
 * (overlapping node IDs) but provide different correction text.
 */
export function detectConflictingCorrections(
  corrections: InteractionSignal[],
): CorrectionConflict[] {
  const correctionOnly = corrections.filter(
    (s) => s.signalType === 'corrected' && s.correctionText,
  );

  const conflicts: CorrectionConflict[] = [];

  for (let i = 0; i < correctionOnly.length; i++) {
    for (let j = i + 1; j < correctionOnly.length; j++) {
      const a = correctionOnly[i]!;
      const b = correctionOnly[j]!;

      if (a.userId === b.userId) {
        continue;
      }

      const overlapping = a.questionNodeIds.filter(
        (id) => b.questionNodeIds.includes(id),
      );

      if (overlapping.length === 0) {
        continue;
      }

      if (a.correctionText !== b.correctionText) {
        conflicts.push({
          signalA: a,
          signalB: b,
          overlappingNodeIds: overlapping,
        });
      }
    }
  }

  return conflicts;
}

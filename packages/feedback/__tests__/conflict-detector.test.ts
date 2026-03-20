import { describe, it, expect } from 'vitest';
import { detectConflictingCorrections } from '../src/conflict-detector.js';
import type { InteractionSignal } from '../src/types.js';

function makeCorrection(overrides: Partial<InteractionSignal> = {}): InteractionSignal {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    signalType: 'corrected',
    correctionText: 'Some correction',
    questionNodeIds: ['node-1'],
    timeToActionMs: 500,
    reputationWeight: 1.0,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('detectConflictingCorrections', () => {
  it('should find conflicting corrections on the same topic from different users', () => {
    const corrections = [
      makeCorrection({ userId: 'user-a', correctionText: 'Answer is X', questionNodeIds: ['n1'] }),
      makeCorrection({ userId: 'user-b', correctionText: 'Answer is Y', questionNodeIds: ['n1'] }),
    ];

    const conflicts = detectConflictingCorrections(corrections);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlappingNodeIds).toEqual(['n1']);
    expect(conflicts[0]!.signalA.userId).toBe('user-a');
    expect(conflicts[0]!.signalB.userId).toBe('user-b');
  });

  it('should not flag corrections on different topics', () => {
    const corrections = [
      makeCorrection({ userId: 'user-a', correctionText: 'X', questionNodeIds: ['n1'] }),
      makeCorrection({ userId: 'user-b', correctionText: 'Y', questionNodeIds: ['n2'] }),
    ];

    const conflicts = detectConflictingCorrections(corrections);
    expect(conflicts).toHaveLength(0);
  });

  it('should not flag corrections from the same user', () => {
    const corrections = [
      makeCorrection({ userId: 'user-a', correctionText: 'X', questionNodeIds: ['n1'] }),
      makeCorrection({ userId: 'user-a', correctionText: 'Y', questionNodeIds: ['n1'] }),
    ];

    const conflicts = detectConflictingCorrections(corrections);
    expect(conflicts).toHaveLength(0);
  });

  it('should not flag corrections with identical text', () => {
    const corrections = [
      makeCorrection({ userId: 'user-a', correctionText: 'Same answer', questionNodeIds: ['n1'] }),
      makeCorrection({ userId: 'user-b', correctionText: 'Same answer', questionNodeIds: ['n1'] }),
    ];

    const conflicts = detectConflictingCorrections(corrections);
    expect(conflicts).toHaveLength(0);
  });

  it('should skip non-corrected signal types', () => {
    const signals = [
      makeCorrection({ userId: 'user-a', signalType: 'accepted', questionNodeIds: ['n1'] }),
      makeCorrection({ userId: 'user-b', correctionText: 'Y', questionNodeIds: ['n1'] }),
    ];

    const conflicts = detectConflictingCorrections(signals);
    expect(conflicts).toHaveLength(0);
  });

  it('should detect multiple overlapping node IDs', () => {
    const corrections = [
      makeCorrection({ userId: 'user-a', correctionText: 'X', questionNodeIds: ['n1', 'n2', 'n3'] }),
      makeCorrection({ userId: 'user-b', correctionText: 'Y', questionNodeIds: ['n2', 'n3', 'n4'] }),
    ];

    const conflicts = detectConflictingCorrections(corrections);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlappingNodeIds).toEqual(['n2', 'n3']);
  });

  it('should return empty for empty input', () => {
    expect(detectConflictingCorrections([])).toEqual([]);
  });
});

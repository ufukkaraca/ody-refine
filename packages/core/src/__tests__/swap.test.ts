import { describe, it, expect } from 'vitest';
import {
  shouldCreateSwap,
  inferSwapType,
  SWAP_THRESHOLDS,
  type SwapCandidate,
} from '../policies/swap.js';

function candidate(overrides: Partial<SwapCandidate> = {}): SwapCandidate {
  return {
    reserveAId: 'a',
    reserveBId: 'b',
    similarityScore: 0.5,
    sharedEntities: [],
    suggestedType: 'related',
    suggestedReason: '',
    ...overrides,
  };
}

describe('SWAP_THRESHOLDS', () => {
  it('has expected default values', () => {
    expect(SWAP_THRESHOLDS.minSimilarity).toBe(0.75);
    expect(SWAP_THRESHOLDS.minSharedEntities).toBe(1);
    expect(SWAP_THRESHOLDS.autoSwapConfidence).toBe(0.6);
  });
});

describe('shouldCreateSwap', () => {
  it('creates swap for high similarity alone', () => {
    expect(shouldCreateSwap(candidate({ similarityScore: 0.75 }))).toBe(true);
    expect(shouldCreateSwap(candidate({ similarityScore: 0.9 }))).toBe(true);
  });

  it('does not create for similarity just below threshold', () => {
    expect(shouldCreateSwap(candidate({ similarityScore: 0.74 }))).toBe(false);
  });

  it('creates swap for shared entities + moderate similarity', () => {
    expect(
      shouldCreateSwap(
        candidate({ similarityScore: 0.5, sharedEntities: ['entity1'] })
      )
    ).toBe(true);
  });

  it('does not create for shared entities with low similarity', () => {
    expect(
      shouldCreateSwap(
        candidate({ similarityScore: 0.49, sharedEntities: ['entity1'] })
      )
    ).toBe(false);
  });

  it('does not create for moderate similarity without shared entities', () => {
    expect(
      shouldCreateSwap(candidate({ similarityScore: 0.5, sharedEntities: [] }))
    ).toBe(false);
  });

  it('boundary: exactly 0.75 similarity creates swap', () => {
    expect(shouldCreateSwap(candidate({ similarityScore: 0.75 }))).toBe(true);
  });

  it('boundary: exactly 0.5 similarity with 1 entity creates swap', () => {
    expect(
      shouldCreateSwap(
        candidate({ similarityScore: 0.5, sharedEntities: ['e'] })
      )
    ).toBe(true);
  });
});

describe('inferSwapType', () => {
  it('returns person_knows for person keywords in title A', () => {
    const result = inferSwapType([], 'senior engineer profile', 'api docs');
    expect(result.type).toBe('person_knows');
  });

  it('returns person_knows for person keywords in title B', () => {
    const result = inferSwapType([], 'project plan', 'lead designer bio');
    expect(result.type).toBe('person_knows');
  });

  it('returns caused_by for causal language', () => {
    const result = inferSwapType([], 'caused by network timeout', 'outage report');
    expect(result.type).toBe('caused_by');

    const result2 = inferSwapType([], 'result of migration', 'schema change');
    expect(result2.type).toBe('caused_by');
  });

  it('returns contradicts for contradiction indicators', () => {
    expect(inferSwapType([], 'wrong assumption about auth', 'auth doc').type).toBe('contradicts');
    expect(inferSwapType([], 'incorrect deployment steps', 'deploy guide').type).toBe('contradicts');
    expect(inferSwapType([], 'contradicts previous decision', 'old plan').type).toBe('contradicts');
  });

  it('returns related with shared entities reason', () => {
    const result = inferSwapType(['react', 'api'], 'frontend code', 'backend code');
    expect(result.type).toBe('related');
    expect(result.reason).toContain('react');
    expect(result.reason).toContain('api');
  });

  it('returns related with similarity reason when no shared entities', () => {
    const result = inferSwapType([], 'some topic', 'another topic');
    expect(result.type).toBe('related');
    expect(result.reason).toContain('Semantic similarity');
  });

  it('limits shared entities in reason to 3', () => {
    const result = inferSwapType(
      ['alpha', 'beta', 'gamma', 'delta'],
      'topic one',
      'topic two'
    );
    expect(result.reason).toContain('alpha');
    expect(result.reason).toContain('gamma');
    expect(result.reason).not.toContain('delta');
  });
});

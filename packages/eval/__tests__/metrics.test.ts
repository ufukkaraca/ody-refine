import { describe, it, expect } from 'vitest';
import {
  calculateAccuracy,
  calculateSemanticSimilarity,
  cosineSimilarity,
  detectContradiction,
} from '../src/metrics.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('calculateSemanticSimilarity', () => {
  it('delegates to cosineSimilarity', () => {
    const result = calculateSemanticSimilarity([1, 0], [1, 0]);
    expect(result).toBeCloseTo(1);
  });
});

describe('calculateAccuracy', () => {
  it('returns 1 for exact match', () => {
    const text = 'The deployment uses Kubernetes orchestration';
    expect(calculateAccuracy(text, text)).toBeCloseTo(1);
  });

  it('returns 0 when no keywords overlap', () => {
    expect(calculateAccuracy('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
  });

  it('returns partial score for partial overlap', () => {
    const expected = 'The API uses REST and GraphQL endpoints';
    const actual = 'The API supports REST but not SOAP';
    const score = calculateAccuracy(expected, actual);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 1 for empty expected', () => {
    expect(calculateAccuracy('', 'anything')).toBe(1);
  });

  it('ignores short words (<=2 chars)', () => {
    // "is" and "a" are filtered out
    expect(calculateAccuracy('it is a', 'it is a')).toBe(1);
  });
});

describe('detectContradiction', () => {
  it('detects negation with shared subject', () => {
    const expected = 'The server uses encryption for data';
    const actual = 'The server does not use encryption';
    expect(detectContradiction(expected, actual)).toBe(true);
  });

  it('returns false when no negation present', () => {
    const expected = 'The API returns JSON';
    const actual = 'The API returns JSON responses';
    expect(detectContradiction(expected, actual)).toBe(false);
  });

  it('returns false when no shared subjects', () => {
    const expected = 'The database stores records';
    const actual = 'Nothing is configured properly';
    expect(detectContradiction(expected, actual)).toBe(false);
  });

  it('detects "never" as negation', () => {
    const expected = 'The system always retries failed requests';
    const actual = 'The system never retries anything';
    expect(detectContradiction(expected, actual)).toBe(true);
  });
});

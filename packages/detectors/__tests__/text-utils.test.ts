import { describe, it, expect } from 'vitest';
import {
  normalize,
  tokenize,
  sharedTokens,
  lexicalScore,
  buildSignal,
  STOP_WORDS,
} from '../src/helpers/text-utils.js';

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalize('  foo   bar  ')).toBe('foo bar');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('tokenize', () => {
  it('splits and filters stop words', () => {
    const tokens = tokenize('The quick brown fox and the lazy dog');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    expect(tokens).toContain('lazy');
    expect(tokens).toContain('dog');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
  });

  it('filters short tokens (len < 2)', () => {
    const tokens = tokenize('I am a big cat');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
    expect(tokens).toContain('am');
    expect(tokens).toContain('big');
    expect(tokens).toContain('cat');
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('sharedTokens', () => {
  it('returns intersection', () => {
    const result = sharedTokens(['foo', 'bar', 'baz'], ['bar', 'baz', 'qux']);
    expect(result.sort()).toEqual(['bar', 'baz']);
  });

  it('returns empty for no overlap', () => {
    expect(sharedTokens(['a', 'b'], ['c', 'd'])).toEqual([]);
  });

  it('deduplicates first array', () => {
    const result = sharedTokens(['foo', 'foo', 'bar'], ['foo']);
    expect(result).toEqual(['foo']);
  });
});

describe('lexicalScore', () => {
  it('returns 1 for identical sets', () => {
    expect(lexicalScore(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(lexicalScore(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(lexicalScore([], [])).toBe(0);
  });

  it('computes Jaccard correctly', () => {
    // intersection = {b}, union = {a, b, c} => 1/3
    const score = lexicalScore(['a', 'b'], ['b', 'c']);
    expect(score).toBeCloseTo(1 / 3);
  });
});

describe('buildSignal', () => {
  it('builds titleTokens and tokens', () => {
    const signal = buildSignal('API Migration Plan', ['move to v2', 'deprecate v1']);
    expect(signal.titleTokens).toContain('api');
    expect(signal.titleTokens).toContain('migration');
    expect(signal.titleTokens).toContain('plan');
    expect(signal.tokens.length).toBeGreaterThan(signal.titleTokens.length);
  });
});

describe('STOP_WORDS', () => {
  it('contains expected words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('discussion')).toBe(true);
    expect(STOP_WORDS.has('new')).toBe(true);
  });

  it('does not contain non-stop words', () => {
    expect(STOP_WORDS.has('api')).toBe(false);
  });
});

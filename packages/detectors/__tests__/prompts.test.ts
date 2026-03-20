import { describe, it, expect } from 'vitest';
import {
  pairKey,
  CLAIM_COMPARISON_TIMEOUT_MS,
  NLI_TIMEOUT_MS,
  MAX_CLAIM_COMPARISON_CALLS,
  MAX_NLI_CALLS,
  LLM_BATCH_SIZE,
} from '../src/prompts.js';

describe('prompts', () => {
  describe('pairKey', () => {
    it('returns canonical order regardless of argument order', () => {
      expect(pairKey('a', 'b')).toBe('a:b');
      expect(pairKey('b', 'a')).toBe('a:b');
    });

    it('handles equal ids', () => {
      expect(pairKey('x', 'x')).toBe('x:x');
    });
  });

  describe('constants', () => {
    it('exports expected timeout values', () => {
      expect(CLAIM_COMPARISON_TIMEOUT_MS).toBe(8_000);
      expect(NLI_TIMEOUT_MS).toBe(15_000);
    });

    it('exports expected limits', () => {
      expect(MAX_CLAIM_COMPARISON_CALLS).toBe(30);
      expect(MAX_NLI_CALLS).toBe(100);
      expect(LLM_BATCH_SIZE).toBe(5);
    });
  });
});

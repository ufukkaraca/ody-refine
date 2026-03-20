import { describe, it, expect } from 'vitest';
import {
  shouldCreateSwap,
  inferSwapType,
  SWAP_THRESHOLDS,
} from '../policies/swap.js';

describe('Swap Policy', () => {
  describe('shouldCreateSwap', () => {
    it('creates swap for high similarity', () => {
      const candidate = {
        reserveAId: 'a',
        reserveBId: 'b',
        similarityScore: 0.8,
        sharedEntities: [],
        suggestedType: 'related' as const,
        suggestedReason: 'Similar',
      };

      expect(shouldCreateSwap(candidate)).toBe(true);
    });

    it('creates swap for shared entities with moderate similarity', () => {
      const candidate = {
        reserveAId: 'a',
        reserveBId: 'b',
        similarityScore: 0.55,
        sharedEntities: ['pgvector', 'embeddings'],
        suggestedType: 'related' as const,
        suggestedReason: 'Shared entities',
      };

      expect(shouldCreateSwap(candidate)).toBe(true);
    });

    it('does not create swap for low similarity without entities', () => {
      const candidate = {
        reserveAId: 'a',
        reserveBId: 'b',
        similarityScore: 0.3,
        sharedEntities: [],
        suggestedType: 'related' as const,
        suggestedReason: 'Low match',
      };

      expect(shouldCreateSwap(candidate)).toBe(false);
    });

    it('respects threshold constant', () => {
      expect(SWAP_THRESHOLDS.minSimilarity).toBe(0.75);
      expect(SWAP_THRESHOLDS.minSharedEntities).toBe(1);
      expect(SWAP_THRESHOLDS.autoSwapConfidence).toBe(0.6);
    });
  });

  describe('inferSwapType', () => {
    it('detects person_knows for person keywords', () => {
      const result = inferSwapType([], 'john engineer profile', 'api documentation');
      expect(result.type).toBe('person_knows');
    });

    it('detects caused_by for causal language', () => {
      const result = inferSwapType([], 'bug caused by null check', 'fix applied');
      expect(result.type).toBe('caused_by');
    });

    it('detects contradicts for contradiction language', () => {
      const result = inferSwapType([], 'wrong assumption about api', 'correct approach');
      expect(result.type).toBe('contradicts');
    });

    it('defaults to related with shared entities', () => {
      const result = inferSwapType(['pgvector', 'postgres'], 'vector search', 'database setup');
      expect(result.type).toBe('related');
      expect(result.reason).toContain('Shared entities');
    });

    it('defaults to related with similarity', () => {
      const result = inferSwapType([], 'vector search', 'semantic search');
      expect(result.type).toBe('related');
      expect(result.reason).toContain('Semantic similarity');
    });
  });
});

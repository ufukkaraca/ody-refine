// EXCEEDS_LIMIT: test fixtures
import { describe, it, expect } from 'vitest';
import {
  calculateReserveConfidence,
  calculateAnswerConfidence,
} from '../policies/confidence.js';
import {
  shouldCreateSwap,
  inferSwapType,
  SWAP_THRESHOLDS,
} from '../policies/swap.js';
import type { EvidenceRef, Reserve, Reputation } from '../entities/index.js';

describe('Confidence Policy', () => {
  describe('calculateReserveConfidence', () => {
    it('returns low confidence (0.3) for no evidence', () => {
      const confidence = calculateReserveConfidence([], new Map());
      expect(confidence).toBe(0.3);
    });

    it('calculates confidence based on evidence relevance', () => {
      const evidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.9,
          addedAt: new Date().toISOString(),
        },
      ];
      const confidence = calculateReserveConfidence(evidence, new Map());
      // Single evidence with high relevance should give decent confidence
      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('boosts confidence with multiple evidence sources', () => {
      const singleEvidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
      ];
      const multiEvidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
        {
          source: { type: 'slack', id: '2' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
        {
          source: { type: 'document', id: '3' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
      ];

      const singleConfidence = calculateReserveConfidence(singleEvidence, new Map());
      const multiConfidence = calculateReserveConfidence(multiEvidence, new Map());

      expect(multiConfidence).toBeGreaterThan(singleConfidence);
    });

    it('applies recency boost for recent evidence', () => {
      const recentEvidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
        {
          source: { type: 'conversation', id: '2' },
          relevance: 0.8,
          addedAt: new Date().toISOString(),
        },
      ];
      const oldEvidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.8,
          addedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
        },
        {
          source: { type: 'conversation', id: '2' },
          relevance: 0.8,
          addedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
        },
      ];

      const recentConfidence = calculateReserveConfidence(recentEvidence, new Map());
      const oldConfidence = calculateReserveConfidence(oldEvidence, new Map());

      // Recent evidence should have higher confidence due to recency factor
      expect(recentConfidence).toBeGreaterThanOrEqual(oldConfidence);
    });

    it('boosts confidence based on author reputation', () => {
      const evidence: EvidenceRef[] = [
        {
          source: { type: 'conversation', id: '1' },
          relevance: 0.7,
          addedAt: new Date().toISOString(),
          addedBy: 'user-1',
        },
        {
          source: { type: 'slack', id: '2' },
          relevance: 0.7,
          addedAt: new Date().toISOString(),
          addedBy: 'user-1',
        },
      ];

      const noReputation = calculateReserveConfidence(evidence, new Map());

      const reputations = new Map<string, Reputation>();
      reputations.set('user-1', {
        userId: 'user-1',
        topics: [],
        overallConfidence: 0.95, // Very high reputation
      });

      const withReputation = calculateReserveConfidence(evidence, reputations);

      // High reputation should boost confidence
      expect(withReputation).toBeGreaterThanOrEqual(noReputation);
    });
  });

  describe('calculateAnswerConfidence', () => {
    it('returns low confidence for no reserves', () => {
      const result = calculateAnswerConfidence([], []);
      expect(result.confidence).toBe(0.1);
      expect(result.explanation).toContain('No relevant knowledge');
    });

    it('calculates weighted confidence from reserves', () => {
      const reserves: Reserve[] = [
        { id: '1', vaultId: 'v1', title: 'Test 1', topic: 't1', confidence: 0.9, evidence: [], createdAt: new Date(), updatedAt: new Date() },
        { id: '2', vaultId: 'v1', title: 'Test 2', topic: 't2', confidence: 0.5, evidence: [], createdAt: new Date(), updatedAt: new Date() },
      ];
      const relevances = [0.8, 0.2]; // First reserve more relevant

      const result = calculateAnswerConfidence(reserves, relevances);

      // Should be closer to 0.9 (weighted by relevance)
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('provides appropriate explanation for high confidence', () => {
      const reserves: Reserve[] = [
        { id: '1', vaultId: 'v1', title: 'Test 1', topic: 't1', confidence: 0.95, evidence: [], createdAt: new Date(), updatedAt: new Date() },
        { id: '2', vaultId: 'v1', title: 'Test 2', topic: 't2', confidence: 0.9, evidence: [], createdAt: new Date(), updatedAt: new Date() },
      ];
      const relevances = [0.9, 0.9];

      const result = calculateAnswerConfidence(reserves, relevances);

      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.explanation).toContain('High confidence');
    });

    it('provides appropriate explanation for low confidence', () => {
      const reserves: Reserve[] = [
        { id: '1', vaultId: 'v1', title: 'Test 1', topic: 't1', confidence: 0.3, evidence: [], createdAt: new Date(), updatedAt: new Date() },
      ];
      const relevances = [0.5];

      const result = calculateAnswerConfidence(reserves, relevances);

      expect(result.confidence).toBeLessThan(0.4);
      expect(result.explanation).toContain('Low confidence');
    });
  });
});

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

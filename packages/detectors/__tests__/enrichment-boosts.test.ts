/**
 * Tests for enrichment-based severity boosts in the contradiction detector.
 * Verifies authoritative and sibling-doc boosting logic.
 */
import { describe, it, expect } from 'vitest';
import {
  detectContradictions,
  areSiblings,
  areBothAuthoritative,
} from '../src/contradictions.js';
import type { KnowledgeNode, KnowledgeEdge } from '@useody/platform-core';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title: 'Test node',
    content: { summary: 'test', facts: [], entities: [] },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<KnowledgeEdge> = {}): KnowledgeEdge {
  return {
    id: crypto.randomUUID(),
    sourceId: '',
    targetId: '',
    type: 'contradicts',
    reason: 'Test contradiction',
    confidence: 0.9,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('areSiblings', () => {
  it('returns true for nodes with same parent chain prefix', () => {
    const a = makeNode({
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering', id: 'sp1' },
          { type: 'page', name: 'Policy A', id: 'p1' },
        ],
      },
    });
    const b = makeNode({
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering', id: 'sp1' },
          { type: 'page', name: 'Policy B', id: 'p2' },
        ],
      },
    });
    expect(areSiblings(a, b)).toBe(true);
  });

  it('returns false for nodes with different parents', () => {
    const a = makeNode({
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering', id: 'sp1' },
          { type: 'page', name: 'Policy A', id: 'p1' },
        ],
      },
    });
    const b = makeNode({
      metadata: {
        parentChain: [
          { type: 'space', name: 'Marketing', id: 'sp2' },
          { type: 'page', name: 'Policy B', id: 'p2' },
        ],
      },
    });
    expect(areSiblings(a, b)).toBe(false);
  });

  it('returns false when parentChain is missing', () => {
    const a = makeNode({ metadata: {} });
    const b = makeNode({ metadata: { parentChain: [{ type: 'space', name: 'X' }] } });
    expect(areSiblings(a, b)).toBe(false);
  });

  it('returns false for different chain lengths', () => {
    const a = makeNode({
      metadata: {
        parentChain: [
          { type: 'workspace', name: 'W' },
          { type: 'space', name: 'S' },
          { type: 'page', name: 'P1' },
        ],
      },
    });
    const b = makeNode({
      metadata: {
        parentChain: [
          { type: 'space', name: 'S' },
          { type: 'page', name: 'P2' },
        ],
      },
    });
    expect(areSiblings(a, b)).toBe(false);
  });
});

describe('areBothAuthoritative', () => {
  it('returns true when both nodes have authoritative: true', () => {
    const a = makeNode({ metadata: { analysisHints: { authoritative: true } } });
    const b = makeNode({ metadata: { analysisHints: { authoritative: true } } });
    expect(areBothAuthoritative(a, b)).toBe(true);
  });

  it('returns false when only one is authoritative', () => {
    const a = makeNode({ metadata: { analysisHints: { authoritative: true } } });
    const b = makeNode({ metadata: { analysisHints: { authoritative: false } } });
    expect(areBothAuthoritative(a, b)).toBe(false);
  });

  it('returns false when hints are missing', () => {
    const a = makeNode({ metadata: {} });
    const b = makeNode({ metadata: { analysisHints: { authoritative: true } } });
    expect(areBothAuthoritative(a, b)).toBe(false);
  });
});

describe('enrichment severity boosts', () => {
  it('upgrades to critical when both docs are authoritative', async () => {
    const a = makeNode({
      title: 'Official Policy A',
      metadata: { analysisHints: { authoritative: true } },
    });
    const b = makeNode({
      title: 'Official Policy B',
      metadata: { analysisHints: { authoritative: true } },
    });
    const edge = makeEdge({
      sourceId: a.id,
      targetId: b.id,
      confidence: 0.5, // would normally be 'warning'
    });

    const results = await detectContradictions([a, b], [edge]);
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('critical');
    expect(results[0]!.metadata?.['boostReason']).toBe('both-authoritative');
  });

  it('upgrades warning to critical for sibling docs', async () => {
    const a = makeNode({
      title: 'Team Page A',
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering' },
          { type: 'page', name: 'A' },
        ],
      },
    });
    const b = makeNode({
      title: 'Team Page B',
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering' },
          { type: 'page', name: 'B' },
        ],
      },
    });
    const edge = makeEdge({
      sourceId: a.id,
      targetId: b.id,
      confidence: 0.5, // would normally be 'warning'
    });

    const results = await detectContradictions([a, b], [edge]);
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('critical');
    expect(results[0]!.metadata?.['boostReason']).toBe('sibling-docs');
  });

  it('does not boost when docs have different parents', async () => {
    const a = makeNode({
      title: 'Policy A',
      metadata: {
        parentChain: [
          { type: 'space', name: 'Engineering' },
          { type: 'page', name: 'A' },
        ],
      },
    });
    const b = makeNode({
      title: 'Policy B',
      metadata: {
        parentChain: [
          { type: 'space', name: 'Marketing' },
          { type: 'page', name: 'B' },
        ],
      },
    });
    const edge = makeEdge({
      sourceId: a.id,
      targetId: b.id,
      confidence: 0.5,
    });

    const results = await detectContradictions([a, b], [edge]);
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warning');
    expect(results[0]!.metadata?.['boostReason']).toBeUndefined();
  });

  it('authoritative boost takes precedence over sibling boost', async () => {
    const a = makeNode({
      title: 'Auth Doc A',
      metadata: {
        analysisHints: { authoritative: true },
        parentChain: [
          { type: 'space', name: 'Eng' },
          { type: 'page', name: 'A' },
        ],
      },
    });
    const b = makeNode({
      title: 'Auth Doc B',
      metadata: {
        analysisHints: { authoritative: true },
        parentChain: [
          { type: 'space', name: 'Eng' },
          { type: 'page', name: 'B' },
        ],
      },
    });
    const edge = makeEdge({
      sourceId: a.id,
      targetId: b.id,
      confidence: 0.5,
    });

    const results = await detectContradictions([a, b], [edge]);
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('critical');
    expect(results[0]!.metadata?.['boostReason']).toBe('both-authoritative');
  });
});

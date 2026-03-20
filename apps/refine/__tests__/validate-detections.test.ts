/**
 * Tests for the LLM validation loop that filters false positives.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Detection, KnowledgeNode, LLMProvider } from '@useody/platform-core';
import { validateDetections } from '../src/detect/validate-detections.js';

// --- Helpers ---

function makeNode(id: string, title: string, raw: string): KnowledgeNode {
  return {
    id,
    title,
    content: { summary: raw, raw },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDetection(nodeIds: string[]): Detection {
  return {
    type: 'contradiction',
    severity: 'critical',
    nodeIds,
    description: 'Possible contradiction: deployments take 30 min vs 5 min.',
  };
}

function makeLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: () => 'mock-model',
  };
}

// --- Tests ---

describe('validateDetections', () => {
  it('marks a genuine contradiction as isReal=true with explanation', async () => {
    const nodeA = makeNode('a', 'Deployment Guide', 'Deployments take 30 minutes.');
    const nodeB = makeNode('b', 'Ops Runbook', 'Deployments take 5 minutes.');
    const detection = makeDetection(['a', 'b']);
    const nodeMap = new Map([['a', nodeA], ['b', nodeB]]);

    const llm = makeLlm(
      JSON.stringify({
        isReal: true,
        explanation: 'Both docs describe the same deploy step with conflicting durations.',
        impact: 'Engineers may miss SLA windows if they rely on the wrong estimate.',
        confidence: 'high',
      }),
    );

    const results = await validateDetections([detection], nodeMap, llm);
    expect(results).toHaveLength(1);
    expect(results[0].isReal).toBe(true);
    expect(results[0].confidence).toBe('high');
    expect(results[0].explanation).toContain('conflicting durations');
    expect(results[0].impact).toContain('SLA');
  });

  it('marks a false positive as isReal=false', async () => {
    const nodeA = makeNode('x', 'EU Privacy Policy', 'We retain data for 30 days in EU.');
    const nodeB = makeNode('y', 'US Privacy Policy', 'We retain data for 90 days in US.');
    const detection = makeDetection(['x', 'y']);
    const nodeMap = new Map([['x', nodeA], ['y', nodeB]]);

    const llm = makeLlm(
      JSON.stringify({
        isReal: false,
        explanation: 'Different regions have different retention rules — not a contradiction.',
        impact: '',
        confidence: 'high',
      }),
    );

    const results = await validateDetections([detection], nodeMap, llm);
    expect(results[0].isReal).toBe(false);
    expect(results[0].explanation).toContain('Different regions');
  });

  it('falls back to isReal=true on LLM timeout', async () => {
    const nodeA = makeNode('a', 'Doc A', 'Content A');
    const nodeB = makeNode('b', 'Doc B', 'Content B');
    const detection = makeDetection(['a', 'b']);
    const nodeMap = new Map([['a', nodeA], ['b', nodeB]]);

    const llm: LLMProvider = {
      complete: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
      stream: vi.fn(),
      getModelId: () => 'slow-model',
    };

    const results = await validateDetections(
      [detection],
      nodeMap,
      llm,
      { timeoutMs: 50 },
    );

    expect(results[0].isReal).toBe(true);
    expect(results[0].confidence).toBe('low');
    expect(results[0].explanation).toContain('timeout');
  });

  it('falls back to isReal=true when node is missing from map', async () => {
    const detection = makeDetection(['missing-a', 'missing-b']);
    const nodeMap = new Map<string, KnowledgeNode>();
    const llm = makeLlm('{}');

    const results = await validateDetections([detection], nodeMap, llm);
    expect(results[0].isReal).toBe(true);
    expect(results[0].explanation).toContain('Insufficient node data');
  });

  it('handles malformed LLM JSON gracefully', async () => {
    const nodeA = makeNode('a', 'Doc A', 'Content A');
    const nodeB = makeNode('b', 'Doc B', 'Content B');
    const detection = makeDetection(['a', 'b']);
    const nodeMap = new Map([['a', nodeA], ['b', nodeB]]);

    const llm = makeLlm('This is not JSON at all, sorry.');

    const results = await validateDetections([detection], nodeMap, llm);
    expect(results[0].isReal).toBe(true);
    expect(results[0].explanation).toContain('parse failed');
  });

  it('processes in batches and calls onProgress', async () => {
    const detections: Detection[] = Array.from({ length: 6 }, (_, i) =>
      makeDetection([`n${String(i)}a`, `n${String(i)}b`]),
    );
    const nodeMap = new Map<string, KnowledgeNode>();
    // All nodes missing → fast fallback path
    const llm = makeLlm('{}');
    const progress: number[] = [];

    await validateDetections(
      detections,
      nodeMap,
      llm,
      { batchSize: 2 },
      (done) => { progress.push(done); },
    );

    // 6 detections in batches of 2 → 3 progress calls (2, 4, 6)
    expect(progress).toEqual([2, 4, 6]);
  });

  it('passes detections beyond maxValidations through unvalidated', async () => {
    const detections: Detection[] = Array.from({ length: 5 }, (_, i) =>
      makeDetection([`a${String(i)}`, `b${String(i)}`]),
    );
    const nodeMap = new Map<string, KnowledgeNode>();
    const llm = makeLlm('{}');

    const results = await validateDetections(
      detections,
      nodeMap,
      llm,
      { maxValidations: 2 },
    );

    expect(results).toHaveLength(5);
    // First 2 go through validation (missing nodes → fallback)
    expect(results[0].explanation).toContain('Insufficient node data');
    // Last 3 are bypassed
    expect(results[2].explanation).toContain('limit exceeded');
    expect(results[3].explanation).toContain('limit exceeded');
    expect(results[4].explanation).toContain('limit exceeded');
  });
});

/**
 * Tests for LLM-powered auto-resolve of contradictions.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Detection, LLMProvider } from '@useody/platform-core';
import { llmAutoResolve } from '../src/resolve/llm-auto-resolve.js';
import type { NodeInfo } from '../src/resolve/resolve-interactive.js';

/** Create a mock detection. */
function makeDetection(
  overrides?: Partial<Detection>,
): Detection {
  return {
    type: 'contradiction',
    severity: 'warning',
    nodeIds: ['node-a', 'node-b'],
    description: 'Conflicting numbers: 500 vs 1000 requests/min',
    suggestedAction: 'Verify rate limit',
    metadata: {},
    ...overrides,
  };
}

/** Build a node lookup map. */
function makeNodeLookup(): Map<string, NodeInfo> {
  const map = new Map<string, NodeInfo>();
  map.set('node-a', {
    title: 'API Documentation',
    raw: 'Rate limit is 1000 requests per minute per API key.',
  });
  map.set('node-b', {
    title: 'Developer Handbook',
    raw: 'Rate limit is 500 requests per minute per key.',
  });
  return map;
}

/** Create a mock LLM provider. */
function makeMockLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-model'),
  };
}

describe('llmAutoResolve', () => {
  it('auto-resolves contradictions using LLM', async () => {
    const llm = makeMockLlm(
      JSON.stringify({
        pick: 'A',
        reasoning: 'API docs are more authoritative',
        confidence: 0.9,
      }),
    );

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.action).toBe('resolve');
    expect(results[0]!.pair).toBeDefined();
    expect(results[0]!.pair!.chosen).toContain('1000');
    expect(results[0]!.pair!.rejected).toContain('500');
    expect(results[0]!.pair!.metadata.resolvedBy).toBe('auto:test-model');
    expect(results[0]!.pair!.metadata.confidence).toBe(0.9);
  });

  it('picks B when LLM says B', async () => {
    const llm = makeMockLlm(
      JSON.stringify({ pick: 'B', reasoning: 'Handbook is newer', confidence: 0.8 }),
    );

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results[0]!.pair!.chosen).toContain('500');
    expect(results[0]!.pair!.rejected).toContain('1000');
  });

  it('skips non-contradiction detections', async () => {
    const llm = makeMockLlm('{}');
    const d = makeDetection({ type: 'staleness', nodeIds: ['node-a'] });

    const results = await llmAutoResolve([d], makeNodeLookup(), llm);

    expect(results[0]!.action).toBe('skip');
    expect(results[0]!.pair).toBeUndefined();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('skips when node data is missing', async () => {
    const llm = makeMockLlm('{}');
    const d = makeDetection({ nodeIds: ['missing-a', 'missing-b'] });

    const results = await llmAutoResolve([d], makeNodeLookup(), llm);

    expect(results[0]!.action).toBe('skip');
  });

  it('skips when LLM returns invalid JSON', async () => {
    const llm = makeMockLlm('not valid json at all');

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results[0]!.action).toBe('skip');
  });

  it('skips when LLM throws an error', async () => {
    const llm: LLMProvider = {
      complete: vi.fn().mockRejectedValue(new Error('network error')),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test-model'),
    };

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results[0]!.action).toBe('skip');
  });

  it('clamps confidence to [0, 1]', async () => {
    const llm = makeMockLlm(
      JSON.stringify({ pick: 'A', reasoning: 'sure', confidence: 1.5 }),
    );

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results[0]!.pair!.metadata.confidence).toBe(1.0);
  });

  it('handles mixed detection types', async () => {
    const llm = makeMockLlm(
      JSON.stringify({ pick: 'A', reasoning: 'ok', confidence: 0.7 }),
    );
    const detections = [
      makeDetection(),
      makeDetection({ type: 'staleness', nodeIds: ['node-a'] }),
      makeDetection({ description: 'Another contradiction' }),
    ];

    const results = await llmAutoResolve(
      detections, makeNodeLookup(), llm,
    );

    expect(results).toHaveLength(3);
    expect(results[0]!.action).toBe('resolve');
    expect(results[1]!.action).toBe('skip');
    expect(results[2]!.action).toBe('resolve');
  });

  it('logs messages via the logger callback', async () => {
    const llm = makeMockLlm(
      JSON.stringify({ pick: 'A', reasoning: 'newer', confidence: 0.9 }),
    );
    const logs: string[] = [];

    await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
      (msg) => logs.push(msg),
    );

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('Auto-resolved'))).toBe(true);
  });

  it('uses default confidence when LLM omits it', async () => {
    const llm = makeMockLlm(
      JSON.stringify({ pick: 'A', reasoning: 'obvious' }),
    );

    const results = await llmAutoResolve(
      [makeDetection()], makeNodeLookup(), llm,
    );

    expect(results[0]!.pair!.metadata.confidence).toBe(0.7);
  });
});

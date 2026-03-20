/**
 * Tests for the interactive resolve flow and preference pair generation.
 */
import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import type { Detection } from '@useody/platform-core';
import {
  runInteractiveResolve,
  generatePrompt,
} from '../src/resolve/resolve-interactive.js';
import type { AskFn, NodeInfo } from '../src/resolve/resolve-interactive.js';
import { autoResolve } from '../src/resolve/auto-resolve.js';

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

/** Build a node lookup map with two contradicting sources. */
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

/** Create a mock ask function that returns answers in order. */
function makeAskFn(answers: string[]): AskFn {
  let idx = 0;
  return async (_question: string): Promise<string> => {
    const answer = answers[idx] ?? '';
    idx++;
    return answer;
  };
}

/** Create a writable stream that captures output. */
function createCaptureOutput(): Writable & { text: string } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void): void {
      chunks.push(chunk.toString());
      cb();
    },
  }) as Writable & { text: string };
  Object.defineProperty(writable, 'text', {
    get: () => chunks.join(''),
  });
  return writable;
}

describe('generatePrompt', () => {
  it('generates rate limit question', () => {
    const d = makeDetection({ description: 'Conflicting rate limit: 500 vs 1000' });
    expect(generatePrompt(d)).toBe('What is the correct rate limit?');
  });

  it('generates timeframe question', () => {
    const d = makeDetection({ description: 'Hour inconsistency: 24 vs 48 hours' });
    expect(generatePrompt(d)).toBe('What is the correct timeframe?');
  });

  it('generates value question', () => {
    const d = makeDetection({ description: 'Conflicting numbers: 5 vs 10' });
    expect(generatePrompt(d)).toBe('What is the correct value?');
  });

  it('generates generic question for unknown descriptions', () => {
    const d = makeDetection({ description: 'Some other issue detected' });
    expect(generatePrompt(d)).toBe('Which version is correct?');
  });
});

describe('runInteractiveResolve', () => {
  it('returns empty array for no detections', async () => {
    const result = await runInteractiveResolve({
      detections: [],
      nodeLookup: new Map(),
      output: createCaptureOutput(),
      askFn: makeAskFn([]),
    });
    expect(result).toEqual([]);
  });

  it('resolves contradiction when user picks A', async () => {
    const output = createCaptureOutput();
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output,
      askFn: makeAskFn(['a']),
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.action).toBe('resolve');
    expect(result[0]!.pair).toBeDefined();
    expect(result[0]!.pair!.chosen).toContain('1000');
    expect(result[0]!.pair!.rejected).toContain('500');
    expect(result[0]!.pair!.metadata.resolvedBy).toBe('cli-user');
    expect(result[0]!.pair!.metadata.confidence).toBe(1.0);
    expect(output.text).toContain('Training pair created');
  });

  it('resolves contradiction when user picks B', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['b']),
    });

    expect(result[0]!.pair!.chosen).toContain('500');
    expect(result[0]!.pair!.rejected).toContain('1000');
  });

  it('skips when user types s', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['s']),
    });
    expect(result[0]!.action).toBe('skip');
    expect(result[0]!.pair).toBeUndefined();
  });

  it('dismisses when user types d', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['d']),
    });
    expect(result[0]!.action).toBe('dismiss');
    expect(result[0]!.pair).toBeUndefined();
  });

  it('handles multiple detections', async () => {
    const output = createCaptureOutput();
    const result = await runInteractiveResolve({
      detections: [
        makeDetection({ description: 'Issue 1: 500 vs 1000 requests' }),
        makeDetection({ description: 'Issue 2: 500 vs 1000 requests' }),
      ],
      nodeLookup: makeNodeLookup(),
      output,
      askFn: makeAskFn(['a', 'b']),
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.action).toBe('resolve');
    expect(result[1]!.action).toBe('resolve');
    expect(output.text).toContain('[1/2]');
    expect(output.text).toContain('[2/2]');
    expect(output.text).toContain('Generated 2 training pair(s)');
  });

  it('handles non-contradiction detections', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection({ type: 'staleness', nodeIds: ['node-a'] })],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['d']),
    });
    expect(result[0]!.action).toBe('dismiss');
    expect(result[0]!.pair).toBeUndefined();
  });

  it('shows progress counter and done message', async () => {
    const output = createCaptureOutput();
    await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output,
      askFn: makeAskFn(['a']),
    });
    expect(output.text).toContain('[1/1]');
    expect(output.text).toContain('Done!');
  });

  it('handles mixed actions across detections', async () => {
    const result = await runInteractiveResolve({
      detections: [
        makeDetection({ description: 'C1: 500 vs 1000 requests' }),
        makeDetection({ description: 'C2: rate limit difference' }),
        makeDetection({ description: 'C3: something else' }),
      ],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['a', 's', 'd']),
    });
    expect(result[0]!.action).toBe('resolve');
    expect(result[0]!.pair).toBeDefined();
    expect(result[1]!.action).toBe('skip');
    expect(result[2]!.action).toBe('dismiss');
  });

  it('displays suggestion text when present', async () => {
    const output = createCaptureOutput();
    await runInteractiveResolve({
      detections: [makeDetection({ suggestedAction: 'Check HR handbook' })],
      nodeLookup: makeNodeLookup(),
      output,
      askFn: makeAskFn(['a']),
    });
    expect(output.text).toContain('Check HR handbook');
  });
});

describe('preference pair structure', () => {
  it('generates valid PreferencePair from interactive resolve', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['a']),
    });
    const pair = result[0]!.pair!;
    expect(pair.prompt).toBeTruthy();
    expect(pair.chosen).toBeTruthy();
    expect(pair.rejected).toBeTruthy();
    expect(pair.metadata.conflictType).toBe('contradiction');
    expect(pair.metadata.resolvedBy).toBe('cli-user');
    expect(pair.metadata.resolvedAt).toBeInstanceOf(Date);
    expect(pair.metadata.sourceNodeIds).toEqual(['node-a', 'node-b']);
  });

  it('serializes to valid JSONL format', async () => {
    const result = await runInteractiveResolve({
      detections: [makeDetection()],
      nodeLookup: makeNodeLookup(),
      output: createCaptureOutput(),
      askFn: makeAskFn(['a']),
    });
    const pair = result[0]!.pair!;
    const line = JSON.stringify({
      prompt: pair.prompt,
      chosen: pair.chosen,
      rejected: pair.rejected,
      metadata: { ...pair.metadata, resolvedAt: pair.metadata.resolvedAt.toISOString() },
    });
    expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('autoResolve (heuristic)', () => {
  it('filters info-level detections', () => {
    const { resolved, remaining } = autoResolve([
      makeDetection({ severity: 'info' }),
      makeDetection({ severity: 'critical' }),
    ]);
    expect(resolved).toHaveLength(1);
    expect(remaining).toHaveLength(1);
  });

  it('handles empty input', () => {
    const { resolved, remaining } = autoResolve([]);
    expect(resolved).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });
});

/**
 * Tests for .ody-refine-ignore file parsing and filtering.
 */
import { describe, it, expect } from 'vitest';
import { parseIgnoreFile, applyIgnoreRules } from '../src/ignore.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'warning',
    nodeIds: ['node-1', 'node-2'],
    description: 'Conflicting numbers: 500 vs 1000 requests per minute',
    suggestedAction: 'Resolve the discrepancy',
    ...overrides,
  };
}

describe('parseIgnoreFile', () => {
  it('parses type rules', () => {
    const rules = parseIgnoreFile('type:contradiction');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe('contradiction');
  });

  it('parses text rules', () => {
    const rules = parseIgnoreFile('text:rate limit');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.text).toBe('rate limit');
  });

  it('parses node rules', () => {
    const rules = parseIgnoreFile('node:abc123');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.nodeId).toBe('abc123');
  });

  it('parses compound rules', () => {
    const rules = parseIgnoreFile('type:time_bomb text:Q1 2025');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe('time_bomb');
    expect(rules[0]!.text).toBe('q1 2025');
  });

  it('skips comments and blank lines', () => {
    const rules = parseIgnoreFile('# comment\n\ntype:staleness\n  \n# another');
    expect(rules).toHaveLength(1);
  });

  it('treats bare words as text patterns', () => {
    const rules = parseIgnoreFile('rate limit');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.text).toBe('rate limit');
  });
});

describe('applyIgnoreRules', () => {
  it('returns all detections when no rules', () => {
    const detections = [makeDetection()];
    expect(applyIgnoreRules(detections, [])).toHaveLength(1);
  });

  it('filters by type', () => {
    const rules = parseIgnoreFile('type:contradiction');
    const detections = [
      makeDetection({ type: 'contradiction' }),
      makeDetection({ type: 'time_bomb' }),
    ];
    expect(applyIgnoreRules(detections, rules)).toHaveLength(1);
    expect(applyIgnoreRules(detections, rules)[0]!.type).toBe('time_bomb');
  });

  it('filters by text', () => {
    const rules = parseIgnoreFile('text:500 vs 1000');
    const detections = [
      makeDetection({ description: 'Conflicting numbers: 500 vs 1000 requests' }),
      makeDetection({ description: 'Document is 6 months old' }),
    ];
    expect(applyIgnoreRules(detections, rules)).toHaveLength(1);
  });

  it('filters by node ID prefix', () => {
    const rules = parseIgnoreFile('node:node-1');
    const detections = [
      makeDetection({ nodeIds: ['node-1', 'node-2'] }),
      makeDetection({ nodeIds: ['node-3', 'node-4'] }),
    ];
    expect(applyIgnoreRules(detections, rules)).toHaveLength(1);
  });
});

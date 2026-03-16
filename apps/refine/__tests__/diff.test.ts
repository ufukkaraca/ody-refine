/**
 * Tests for diff command detection comparison.
 */
import { describe, it, expect } from 'vitest';
import { diffDetections } from '../src/commands/diff.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(type: string, nodeIds: string[]): Detection {
  return {
    type,
    severity: 'warning',
    nodeIds,
    description: `Detection: ${type}`,
    suggestedAction: 'fix',
  };
}

describe('diffDetections', () => {
  it('identifies new detections', () => {
    const current = [makeDetection('contradiction', ['a', 'b'])];
    const previous: Detection[] = [];
    const { added, removed, unchanged } = diffDetections(current, previous);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(0);
    expect(unchanged).toHaveLength(0);
  });

  it('identifies removed detections', () => {
    const current: Detection[] = [];
    const previous = [makeDetection('staleness', ['c'])];
    const { added, removed, unchanged } = diffDetections(current, previous);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it('identifies unchanged detections', () => {
    const d = makeDetection('contradiction', ['a', 'b']);
    const { added, removed, unchanged } = diffDetections([d], [d]);
    expect(unchanged).toHaveLength(1);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it('handles mixed changes', () => {
    const kept = makeDetection('contradiction', ['a', 'b']);
    const newOne = makeDetection('time_bomb', ['c']);
    const oldOne = makeDetection('duplicate', ['d', 'e']);

    const current = [kept, newOne];
    const previous = [kept, oldOne];
    const { added, removed, unchanged } = diffDetections(current, previous);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(unchanged).toHaveLength(1);
  });
});

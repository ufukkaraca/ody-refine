/**
 * Tests for diff command detection comparison.
 */
import { describe, it, expect } from 'vitest';
import { detectionFingerprint, diffDetections } from '../src/commands/diff.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(
  type: string,
  nodeIds: string[],
  description?: string,
): Detection {
  return {
    type,
    severity: 'warning',
    nodeIds,
    description: description ?? `Detection: ${type}`,
    suggestedAction: 'fix',
  };
}

describe('detectionFingerprint', () => {
  it('produces stable key from type and sorted nodeIds', () => {
    const d = makeDetection('contradiction', ['b', 'a'], 'Pages disagree on X');
    expect(detectionFingerprint(d)).toBe('contradiction::a,b');
  });

  it('matches same nodes regardless of description wording', () => {
    const a = makeDetection('staleness', ['node-1'], 'Doc is stale');
    const b = makeDetection('staleness', ['node-1'], 'This document is outdated');
    expect(detectionFingerprint(a)).toBe(detectionFingerprint(b));
  });

  it('sorts nodeIds for order-independent matching', () => {
    const a = makeDetection('contradiction', ['z', 'a', 'm']);
    const b = makeDetection('contradiction', ['a', 'm', 'z']);
    expect(detectionFingerprint(a)).toBe(detectionFingerprint(b));
  });

  it('different nodeIds produce different fingerprints', () => {
    const a = makeDetection('staleness', ['node-1'], 'Same desc');
    const b = makeDetection('staleness', ['node-2'], 'Same desc');
    expect(detectionFingerprint(a)).not.toBe(detectionFingerprint(b));
  });

  it('different types produce different fingerprints', () => {
    const a = makeDetection('contradiction', ['a'], 'same desc');
    const b = makeDetection('staleness', ['a'], 'same desc');
    expect(detectionFingerprint(a)).not.toBe(detectionFingerprint(b));
  });
});

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
    const { added, removed } = diffDetections(current, previous);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it('identifies unchanged detections by nodeIds', () => {
    const prev = makeDetection('contradiction', ['a', 'b'], 'Old wording');
    const curr = makeDetection('contradiction', ['a', 'b'], 'New wording from LLM');
    const { added, removed, unchanged } = diffDetections([curr], [prev]);
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

  it('matches same detection across re-scans with varied descriptions', () => {
    const prev = makeDetection(
      'contradiction',
      ['uuid-1', 'uuid-2'],
      'Page A contradicts Page B about deployment',
    );
    const curr = makeDetection(
      'contradiction',
      ['uuid-1', 'uuid-2'],
      'Deployment info conflicts between Page A and Page B',
    );

    const { added, removed, unchanged } = diffDetections([curr], [prev]);
    expect(unchanged).toHaveLength(1);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it('treats different source nodes as different detections', () => {
    const prev = makeDetection('staleness', ['node-a'], 'Doc X is 90 days old');
    const curr = makeDetection('staleness', ['node-b'], 'Doc Y is 120 days old');

    const { added, removed } = diffDetections([curr], [prev]);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });
});

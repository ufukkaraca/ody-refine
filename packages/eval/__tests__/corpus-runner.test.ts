import { describe, it, expect } from 'vitest';
import {
  computePrecisionRecallF1,
  evaluateContradictionDetector,
  evaluateStalenessDetector,
} from '../src/corpus-runner.js';
import type { Detection } from '@useody/platform-core';
import type {
  ContradictionGroundTruth,
  StalenessGroundTruth,
} from '../src/corpus-types.js';

describe('computePrecisionRecallF1', () => {
  it('returns perfect scores when all predictions match', () => {
    const expected = new Set(['a', 'b']);
    const detected = new Set(['a', 'b']);
    const all = ['a', 'b', 'c', 'd'];

    const result = computePrecisionRecallF1(expected, detected, all);

    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
    expect(result.truePositives).toBe(2);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
  });

  it('computes correct metrics with false positives', () => {
    const expected = new Set(['a']);
    const detected = new Set(['a', 'b']); // b is false positive
    const all = ['a', 'b', 'c'];

    const result = computePrecisionRecallF1(expected, detected, all);

    expect(result.precision).toBe(0.5);
    expect(result.recall).toBe(1);
    expect(result.truePositives).toBe(1);
    expect(result.falsePositives).toBe(1);
    expect(result.falseNegatives).toBe(0);
  });

  it('computes correct metrics with false negatives', () => {
    const expected = new Set(['a', 'b']);
    const detected = new Set(['a']); // missed b
    const all = ['a', 'b', 'c'];

    const result = computePrecisionRecallF1(expected, detected, all);

    expect(result.precision).toBe(1);
    expect(result.recall).toBe(0.5);
    expect(result.truePositives).toBe(1);
    expect(result.falseNegatives).toBe(1);
  });

  it('handles empty sets', () => {
    const result = computePrecisionRecallF1(new Set(), new Set(), []);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it('handles all false positives', () => {
    const expected = new Set<string>();
    const detected = new Set(['a', 'b']);
    const all = ['a', 'b'];

    const result = computePrecisionRecallF1(expected, detected, all);

    expect(result.precision).toBe(0);
    expect(result.recall).toBe(1); // no positives to miss
    expect(result.falsePositives).toBe(2);
  });

  it('handles all false negatives', () => {
    const expected = new Set(['a', 'b']);
    const detected = new Set<string>();
    const all = ['a', 'b'];

    const result = computePrecisionRecallF1(expected, detected, all);

    expect(result.precision).toBe(1); // nothing detected, nothing wrong
    expect(result.recall).toBe(0);
    expect(result.falseNegatives).toBe(2);
  });
});

describe('evaluateContradictionDetector', () => {
  const groundTruth: ContradictionGroundTruth = {
    corpus: 'test',
    description: 'Test corpus',
    pairs: [
      { id: 'p1', category: 'numerical', hasContradiction: true, docA: 'a', docB: 'b', expectedFinding: { type: 'contradiction', minSeverity: 'warning', description: 'test' } },
      { id: 'p2', category: 'none', hasContradiction: false, docA: 'c', docB: 'd', expectedFinding: null },
    ],
  };

  it('returns correct structure', () => {
    const detections: Detection[] = [];
    const nodes = [
      { id: 'n1', title: 'A', content: { summary: 's' }, embedding: [], embeddingModel: 't', embeddingDim: 0, confidence: 0.9, createdAt: new Date(), updatedAt: new Date() },
    ];

    const result = evaluateContradictionDetector(groundTruth, nodes, detections);

    expect(result.corpus).toBe('test');
    expect(result.detectorType).toBe('contradiction');
    expect(result.details).toHaveLength(2);
    expect(result.runAt).toBeInstanceOf(Date);
  });
});

describe('evaluateStalenessDetector', () => {
  const groundTruth: StalenessGroundTruth = {
    corpus: 'test-stale',
    description: 'Test staleness',
    documents: [
      { id: 'stale-01', isStale: true, reason: 'old', expectedSeverity: 'warning' },
      { id: 'current-01', isStale: false, reason: 'fresh' },
    ],
  };

  it('correctly scores staleness detections', () => {
    const detections: Detection[] = [
      { type: 'staleness', severity: 'warning', nodeIds: ['stale-01'], description: 'old doc', suggestedAction: 'update' },
    ];

    const result = evaluateStalenessDetector(groundTruth, detections);

    expect(result.metrics.truePositives).toBe(1);
    expect(result.metrics.falsePositives).toBe(0);
    expect(result.metrics.falseNegatives).toBe(0);
    expect(result.metrics.precision).toBe(1);
    expect(result.metrics.recall).toBe(1);
  });

  it('counts false positives', () => {
    const detections: Detection[] = [
      { type: 'staleness', severity: 'warning', nodeIds: ['stale-01'], description: 'old', suggestedAction: 'update' },
      { type: 'staleness', severity: 'info', nodeIds: ['current-01'], description: 'false', suggestedAction: 'review' },
    ];

    const result = evaluateStalenessDetector(groundTruth, detections);

    expect(result.metrics.truePositives).toBe(1);
    expect(result.metrics.falsePositives).toBe(1);
    expect(result.metrics.precision).toBe(0.5);
  });
});

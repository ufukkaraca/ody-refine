/**
 * Tests for the autoresearch optimization module.
 */
import { describe, it, expect } from 'vitest';
import type { Detection } from '@useody/platform-core';
import {
  scoreDetections,
  clampConfig,
  DEFAULT_DETECTOR_CONFIG,
} from '../src/autoresearch/index.js';
import type { GroundTruth } from '../src/autoresearch/index.js';

describe('scoreDetections', () => {
  const truth: GroundTruth[] = [
    { type: 'contradiction', description: '64 GPUs max vs 256 GPUs max', severity: 'warning', shouldFind: true },
    { type: 'contradiction', description: 'Under a minute vs a few minutes spin-up', severity: 'warning', shouldFind: true },
    { type: 'contradiction', description: 'CPU pricing vs memory pricing', severity: 'info', shouldFind: false },
  ];

  it('perfect recall when all positives found', () => {
    const detections: Detection[] = [
      { type: 'contradiction', severity: 'warning', nodeIds: ['a'], description: '64 GPUs max vs 256 GPUs max mismatch' },
      { type: 'contradiction', severity: 'warning', nodeIds: ['b'], description: 'spin-up time under a minute vs few minutes' },
    ];
    const score = scoreDetections(detections, truth);
    expect(score.truePositives).toBe(2);
    expect(score.falseNegatives).toBe(0);
    expect(score.recall).toBe(1.0);
  });

  it('tracks false negatives when positives missed', () => {
    const detections: Detection[] = [
      { type: 'contradiction', severity: 'warning', nodeIds: ['a'], description: '64 GPUs max vs 256 GPUs max' },
    ];
    const score = scoreDetections(detections, truth);
    expect(score.truePositives).toBe(1);
    expect(score.falseNegatives).toBe(1);
    expect(score.recall).toBe(0.5);
  });

  it('counts false positives for negative truth matches', () => {
    const detections: Detection[] = [
      { type: 'contradiction', severity: 'info', nodeIds: ['c'], description: 'CPU pricing vs memory pricing difference' },
    ];
    const score = scoreDetections(detections, truth);
    expect(score.falsePositives).toBe(1);
    expect(score.truePositives).toBe(0);
    expect(score.precision).toBe(0);
  });

  it('returns zero F1 with no detections and positive truth', () => {
    const score = scoreDetections([], truth);
    expect(score.f1).toBe(0);
    expect(score.falseNegatives).toBe(2);
  });

  it('handles empty truth gracefully', () => {
    const score = scoreDetections([], []);
    expect(score.precision).toBe(0);
    expect(score.recall).toBe(1);
    expect(score.f1).toBe(0);
  });

  it('computes F1 correctly', () => {
    const detections: Detection[] = [
      { type: 'contradiction', severity: 'warning', nodeIds: ['a'], description: '64 GPUs max vs 256 GPUs max' },
      { type: 'contradiction', severity: 'warning', nodeIds: ['b'], description: 'spin-up under minute vs few minutes' },
    ];
    const score = scoreDetections(detections, truth);
    // 2 TP, 0 FP, 0 FN => P=1, R=1, F1=1
    expect(score.f1).toBe(1.0);
  });
});

describe('clampConfig', () => {
  it('clamps values to valid bounds', () => {
    const extreme = {
      ...DEFAULT_DETECTOR_CONFIG,
      contradictions: { similarityThreshold: 0.1, topK: 100, maxLlmCalls: 50 },
    };
    const clamped = clampConfig(extreme);
    expect(clamped.contradictions.similarityThreshold).toBe(0.3);
    expect(clamped.contradictions.topK).toBe(30);
    expect(clamped.contradictions.maxLlmCalls).toBe(20);
  });

  it('preserves values within bounds', () => {
    const clamped = clampConfig(DEFAULT_DETECTOR_CONFIG);
    expect(clamped.contradictions.similarityThreshold).toBe(0.6);
    expect(clamped.contradictions.topK).toBe(10);
  });

  it('preserves requireAllNodes boolean', () => {
    const clamped = clampConfig(DEFAULT_DETECTOR_CONFIG);
    expect(clamped.timeBombs.requireAllNodes).toBe(true);
  });
});

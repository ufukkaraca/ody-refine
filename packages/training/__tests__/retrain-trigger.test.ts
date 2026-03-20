import { describe, it, expect } from 'vitest';
import {
  shouldRetrain,
  DEFAULT_TRIGGER_OPTIONS,
} from '../src/retrain-trigger.js';

describe('shouldRetrain', () => {
  it('returns true when pair count meets threshold', () => {
    const result = shouldRetrain(50, 0);
    expect(result.shouldRetrain).toBe(true);
    expect(result.reason).toContain('Pair threshold met');
    expect(result.pairCount).toBe(50);
  });

  it('returns true when pair count exceeds threshold', () => {
    const result = shouldRetrain(100, 10);
    expect(result.shouldRetrain).toBe(true);
    expect(result.reason).toContain('Pair threshold met');
  });

  it('returns false when below minimum pair threshold and not enough time', () => {
    const result = shouldRetrain(30, 24);
    expect(result.shouldRetrain).toBe(false);
    expect(result.reason).toContain('need 20 more');
  });

  it('returns false when below time-based minimum pairs', () => {
    const result = shouldRetrain(5, 200);
    expect(result.shouldRetrain).toBe(false);
    expect(result.reason).toContain('Need');
  });

  it('returns true for time-based trigger (1 week + 10 pairs)', () => {
    const result = shouldRetrain(10, 168);
    expect(result.shouldRetrain).toBe(true);
    expect(result.reason).toContain('Time threshold met');
  });

  it('returns true for time-based trigger with more than min pairs', () => {
    const result = shouldRetrain(25, 200);
    expect(result.shouldRetrain).toBe(true);
    expect(result.reason).toContain('Time threshold met');
  });

  it('returns false when between time-based min and pair threshold, time not elapsed', () => {
    const result = shouldRetrain(30, 100);
    expect(result.shouldRetrain).toBe(false);
    expect(result.reason).toContain('wait');
  });

  it('respects custom minPairs', () => {
    const result = shouldRetrain(20, 0, { minPairs: 20 });
    expect(result.shouldRetrain).toBe(true);
  });

  it('respects custom maxHours', () => {
    const result = shouldRetrain(10, 48, { maxHours: 48 });
    expect(result.shouldRetrain).toBe(true);
  });

  it('respects custom timeBasedMinPairs', () => {
    const result = shouldRetrain(3, 200, { timeBasedMinPairs: 5 });
    expect(result.shouldRetrain).toBe(false);
  });

  it('includes confidence threshold in decision', () => {
    const result = shouldRetrain(50, 0, { minConfidence: 0.8 });
    expect(result.confidenceThreshold).toBe(0.8);
  });

  it('uses Infinity hours for never-trained scenario', () => {
    const result = shouldRetrain(10, Infinity);
    expect(result.shouldRetrain).toBe(true);
    expect(result.sinceLastTraining).toBe(Infinity);
  });

  it('returns zero hours for just-trained scenario', () => {
    const result = shouldRetrain(5, 0);
    expect(result.shouldRetrain).toBe(false);
    expect(result.sinceLastTraining).toBe(0);
  });
});

describe('DEFAULT_TRIGGER_OPTIONS', () => {
  it('has correct default values', () => {
    expect(DEFAULT_TRIGGER_OPTIONS.minPairs).toBe(50);
    expect(DEFAULT_TRIGGER_OPTIONS.maxHours).toBe(168);
    expect(DEFAULT_TRIGGER_OPTIONS.minConfidence).toBe(0.5);
    expect(DEFAULT_TRIGGER_OPTIONS.timeBasedMinPairs).toBe(10);
  });
});

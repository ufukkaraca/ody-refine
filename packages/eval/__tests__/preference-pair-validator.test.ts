import { describe, it, expect } from 'vitest';
import {
  validatePreferencePairs,
  validateTrlDpoJsonl,
} from '../src/preference-pair-validator.js';
import type { PreferencePair } from '@useody/platform-core';

function makePair(overrides: Partial<PreferencePair> = {}): PreferencePair {
  return {
    prompt: 'What is the remote work policy?',
    chosen: 'We are remote-first with no mandatory office days.',
    rejected: 'All employees must be in office 3 days per week.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'test-user',
      resolvedAt: new Date(),
      confidence: 0.95,
      sourceNodeIds: ['node-1', 'node-2'],
    },
    ...overrides,
  };
}

describe('validatePreferencePairs', () => {
  it('passes valid pairs', () => {
    const result = validatePreferencePairs([makePair(), makePair()]);
    expect(result.valid).toBe(true);
    expect(result.totalPairs).toBe(2);
    expect(result.validPairs).toBe(2);
    expect(result.issues).toHaveLength(0);
  });

  it('catches empty prompt', () => {
    const result = validatePreferencePairs([makePair({ prompt: '' })]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'prompt')).toBe(true);
  });

  it('catches empty chosen', () => {
    const result = validatePreferencePairs([makePair({ chosen: '' })]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'chosen')).toBe(true);
  });

  it('catches identical chosen and rejected', () => {
    const result = validatePreferencePairs([
      makePair({ chosen: 'same text', rejected: 'same text' }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.issue.includes('identical'))).toBe(true);
  });

  it('catches confidence out of range', () => {
    const pair = makePair();
    pair.metadata.confidence = 1.5;
    const result = validatePreferencePairs([pair]);
    expect(result.valid).toBe(false);
  });

  it('warns on very short prompt', () => {
    const result = validatePreferencePairs([makePair({ prompt: 'Hi?' })]);
    expect(result.issues.some((i) => i.severity === 'warning' && i.field === 'prompt')).toBe(true);
  });

  it('warns on empty sourceNodeIds', () => {
    const pair = makePair();
    pair.metadata.sourceNodeIds = [];
    const result = validatePreferencePairs([pair]);
    expect(result.issues.some((i) => i.field === 'metadata.sourceNodeIds')).toBe(true);
  });

  it('handles empty array', () => {
    const result = validatePreferencePairs([]);
    expect(result.valid).toBe(true);
    expect(result.totalPairs).toBe(0);
  });

  it('catches UUID in prompt field', () => {
    const pair = makePair({
      prompt: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    const result = validatePreferencePairs([pair]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'prompt' && i.issue.includes('UUID'))).toBe(true);
  });

  it('catches UUID embedded in prompt text', () => {
    const pair = makePair({
      prompt: 'What is a1b2c3d4-e5f6-7890-abcd-ef1234567890?',
    });
    const result = validatePreferencePairs([pair]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.issue.includes('UUID'))).toBe(true);
  });

  it('passes clean natural language prompt', () => {
    const result = validatePreferencePairs([makePair()]);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.issue.includes('UUID'))).toHaveLength(0);
  });
});

describe('validateTrlDpoJsonl', () => {
  it('validates correct TRL format', () => {
    const jsonl = [
      '{"prompt":"Q?","chosen":"A1","rejected":"A2"}',
      '{"prompt":"Q2?","chosen":"B1","rejected":"B2"}',
    ].join('\n');

    const result = validateTrlDpoJsonl(jsonl);
    expect(result.valid).toBe(true);
    expect(result.totalPairs).toBe(2);
  });

  it('catches missing prompt field', () => {
    const jsonl = '{"chosen":"A","rejected":"B"}';
    const result = validateTrlDpoJsonl(jsonl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'prompt')).toBe(true);
  });

  it('catches invalid JSON', () => {
    const jsonl = 'not json at all';
    const result = validateTrlDpoJsonl(jsonl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'json')).toBe(true);
  });

  it('warns on metadata presence in TRL format', () => {
    const jsonl = '{"prompt":"Q","chosen":"A","rejected":"B","metadata":{}}';
    const result = validateTrlDpoJsonl(jsonl);
    expect(result.issues.some(
      (i) => i.field === 'metadata' && i.severity === 'warning',
    )).toBe(true);
  });

  it('handles empty string', () => {
    const result = validateTrlDpoJsonl('');
    expect(result.valid).toBe(true);
    expect(result.totalPairs).toBe(0);
  });

  it('catches UUID in TRL prompt field', () => {
    const jsonl = '{"prompt":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","chosen":"A","rejected":"B"}';
    const result = validateTrlDpoJsonl(jsonl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.issue.includes('UUID'))).toBe(true);
  });
});

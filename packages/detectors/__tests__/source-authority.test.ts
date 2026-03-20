import { describe, it, expect } from 'vitest';
import type { SourceMeta } from '@useody/platform-core';
import {
  clampScore,
  recencyDecay,
  computeAuthority,
  authorityDeltaMultiplier,
  adjustSeverity,
  DEFAULT_AUTHORITY_CONFIG,
} from '../src/source-authority.js';

const now = new Date('2026-03-20');

function makeMeta(overrides: Partial<SourceMeta> = {}): SourceMeta {
  return {
    nodeId: 'n1',
    sourceType: 'notion',
    author: 'test',
    authorRole: 'engineer',
    lastModified: new Date('2026-03-15'),
    ...overrides,
  };
}

describe('source-authority', () => {
  describe('clampScore', () => {
    it('clamps to [0, 1]', () => {
      expect(clampScore(1.5)).toBe(1);
      expect(clampScore(-0.5)).toBe(0);
      expect(clampScore(0.7)).toBe(0.7);
    });

    it('returns fallback for NaN', () => {
      expect(clampScore(NaN)).toBe(0.5);
      expect(clampScore(NaN, 0.3)).toBe(0.3);
    });

    it('returns fallback for Infinity', () => {
      expect(clampScore(Infinity)).toBe(0.5);
      expect(clampScore(-Infinity)).toBe(0.5);
    });
  });

  describe('recencyDecay', () => {
    it('returns 1.0 for just-modified documents', () => {
      const decay = recencyDecay(now, now, 180);
      expect(decay).toBeCloseTo(1.0, 2);
    });

    it('returns ~0.5 at half-life', () => {
      const halfLifeAgo = new Date('2025-09-22'); // ~180 days before 2026-03-20
      const decay = recencyDecay(halfLifeAgo, now, 180);
      expect(decay).toBeCloseTo(0.5, 1);
    });

    it('returns 0.5 for undefined lastModified', () => {
      expect(recencyDecay(undefined, now, 180)).toBe(0.5);
    });

    it('returns 1.0 for future dates', () => {
      const future = new Date('2027-01-01');
      expect(recencyDecay(future, now, 180)).toBe(1.0);
    });
  });

  describe('computeAuthority', () => {
    it('scores executives higher than bots', () => {
      const exec = makeMeta({ authorRole: 'executive' });
      const bot = makeMeta({ authorRole: 'bot' });
      const execScore = computeAuthority(exec, DEFAULT_AUTHORITY_CONFIG, now);
      const botScore = computeAuthority(bot, DEFAULT_AUTHORITY_CONFIG, now);
      expect(execScore).toBeGreaterThan(botScore);
    });

    it('scores confluence higher than slack', () => {
      const confluence = makeMeta({ sourceType: 'confluence' });
      const slack = makeMeta({ sourceType: 'slack' });
      const cScore = computeAuthority(confluence, DEFAULT_AUTHORITY_CONFIG, now);
      const sScore = computeAuthority(slack, DEFAULT_AUTHORITY_CONFIG, now);
      expect(cScore).toBeGreaterThan(sScore);
    });

    it('handles unknown role and source type', () => {
      const unknown = makeMeta({
        authorRole: undefined,
        sourceType: 'unknown',
      });
      const score = computeAuthority(unknown, DEFAULT_AUTHORITY_CONFIG, now);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('authorityDeltaMultiplier', () => {
    it('returns higher multiplier for high-authority sources', () => {
      const highHigh = authorityDeltaMultiplier(0.9, 0.9);
      const lowLow = authorityDeltaMultiplier(0.2, 0.2);
      expect(highHigh).toBeGreaterThan(lowLow);
    });

    it('stays within [0, 2] range', () => {
      expect(authorityDeltaMultiplier(1.0, 1.0)).toBeLessThanOrEqual(2.0);
      expect(authorityDeltaMultiplier(0, 0)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adjustSeverity', () => {
    it('boosts severity for high-authority contradictions', () => {
      const exec = makeMeta({ authorRole: 'executive', sourceType: 'confluence' });
      const result = adjustSeverity('warning', exec, exec, DEFAULT_AUTHORITY_CONFIG);
      expect(result).toBe('critical');
    });

    it('does not exceed critical', () => {
      const exec = makeMeta({ authorRole: 'executive' });
      const result = adjustSeverity('critical', exec, exec, DEFAULT_AUTHORITY_CONFIG);
      expect(result).toBe('critical');
    });
  });
});

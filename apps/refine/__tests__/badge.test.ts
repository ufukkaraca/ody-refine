/**
 * Tests for badge SVG generation.
 */
import { describe, it, expect } from 'vitest';
import { generateBadgeSvg, healthScore } from '../src/commands/badge.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(severity: 'critical' | 'warning' | 'info'): Detection {
  return {
    type: 'contradiction',
    severity,
    nodeIds: ['n1'],
    description: 'test',
    suggestedAction: 'fix',
  };
}

describe('healthScore', () => {
  it('returns 100 for no detections', () => {
    expect(healthScore([])).toBe(100);
  });

  it('penalizes critical detections heavily', () => {
    const score = healthScore([makeDetection('critical')]);
    expect(score).toBeLessThan(95);
    expect(score).toBeGreaterThan(80);
  });

  it('penalizes warnings moderately', () => {
    const score = healthScore([makeDetection('warning')]);
    expect(score).toBeGreaterThan(95);
  });

  it('stacks penalties', () => {
    const score = healthScore([
      makeDetection('critical'),
      makeDetection('critical'),
      makeDetection('warning'),
      makeDetection('warning'),
      makeDetection('warning'),
    ]);
    expect(score).toBeLessThanOrEqual(80);
  });
});

describe('generateBadgeSvg', () => {
  it('generates valid SVG', () => {
    const svg = generateBadgeSvg(85);
    expect(svg).toContain('<svg');
    expect(svg).toContain('85/100');
    expect(svg).toContain('knowledge health');
  });

  it('uses green color for high scores', () => {
    const svg = generateBadgeSvg(90);
    expect(svg).toContain('#4c1');
  });

  it('uses yellow for moderate scores', () => {
    const svg = generateBadgeSvg(65);
    expect(svg).toContain('#dfb317');
  });

  it('uses red for low scores', () => {
    const svg = generateBadgeSvg(30);
    expect(svg).toContain('#e05d44');
  });
});

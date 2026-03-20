/**
 * Tests for badge SVG generation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generateBadgeSvg, healthScore } from '../src/commands/badge.js';
import { saveDetections, saveHealthScore, loadHealthScore } from '../src/detect/detection-store.js';
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

let openDb: (path: string) => unknown;
beforeAll(async () => {
  const core = await import('@useody/platform-core');
  openDb = core.openDatabase;
});

describe('badge uses cached health score', () => {
  it('loadHealthScore returns the pipeline score, not the badge formula', () => {
    const db = openDb(':memory:') as Parameters<typeof saveHealthScore>[0];

    // Simulate pipeline saving detections and the pipeline health score (74)
    const detections: Detection[] = [
      makeDetection('critical'),
      makeDetection('warning'),
      makeDetection('warning'),
      makeDetection('info'),
    ];
    saveDetections(db, detections);
    saveHealthScore(db, 74);

    // The badge formula would produce a different score
    const badgeFormulaScore = healthScore(detections);
    expect(badgeFormulaScore).not.toBe(74);

    // But the cached score matches the pipeline
    const cached = loadHealthScore(db);
    expect(cached).toBe(74);
  });
});

/**
 * Tests for the CI command — score calculation, regression detection,
 * report building, and markdown output formatting.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCiScore,
  buildCiReport,
  formatMarkdown,
} from '../src/commands/ci.js';
import type { CiReport } from '../src/commands/ci.js';
import type { Detection } from '@useody/platform-core';

/** Create a test detection with a given severity. */
function makeDetection(
  severity: 'critical' | 'warning' | 'info',
  type: Detection['type'] = 'contradiction',
): Detection {
  return {
    type,
    severity,
    nodeIds: ['node-a'],
    description: `Test ${severity} ${type} issue`,
  };
}

describe('computeCiScore', () => {
  it('returns 100 for no detections', () => {
    expect(computeCiScore([])).toBe(100);
  });

  it('penalizes critical by 15', () => {
    expect(computeCiScore([makeDetection('critical')])).toBe(85);
  });

  it('penalizes warning by 5', () => {
    expect(computeCiScore([makeDetection('warning')])).toBe(95);
  });

  it('penalizes info by 1', () => {
    expect(computeCiScore([makeDetection('info')])).toBe(99);
  });

  it('floors at 0', () => {
    const detections = Array.from({ length: 10 }, () => makeDetection('critical'));
    expect(computeCiScore(detections)).toBe(0);
  });

  it('combines penalties from mixed severities', () => {
    const detections = [
      makeDetection('critical'),
      makeDetection('warning'),
      makeDetection('info'),
    ];
    expect(computeCiScore(detections)).toBe(79);
  });
});

describe('buildCiReport', () => {
  it('passes when score meets minimum health', () => {
    const report = buildCiReport(80, null, [], 70, false);
    expect(report.pass).toBe(true);
    expect(report.score).toBe(80);
    expect(report.previousScore).toBeNull();
    expect(report.delta).toBeNull();
  });

  it('fails when score is below minimum health', () => {
    const report = buildCiReport(60, null, [], 70, false);
    expect(report.pass).toBe(false);
  });

  it('passes at exactly the minimum threshold', () => {
    const report = buildCiReport(70, null, [], 70, false);
    expect(report.pass).toBe(true);
  });

  it('detects regression and fails', () => {
    const previous = { score: 90, timestamp: '2026-01-01T00:00:00.000Z' };
    const report = buildCiReport(80, previous, [], 70, true);
    expect(report.pass).toBe(false);
    expect(report.delta).toBe(-10);
    expect(report.previousScore).toBe(90);
  });

  it('passes when score improved', () => {
    const previous = { score: 70, timestamp: '2026-01-01T00:00:00.000Z' };
    const report = buildCiReport(80, previous, [], 70, true);
    expect(report.pass).toBe(true);
    expect(report.delta).toBe(10);
  });

  it('ignores regression when fail-on-regression is off', () => {
    const previous = { score: 90, timestamp: '2026-01-01T00:00:00.000Z' };
    const report = buildCiReport(80, previous, [], 70, false);
    expect(report.pass).toBe(true);
  });

  it('maps detections to simplified format', () => {
    const detections = [makeDetection('critical', 'staleness')];
    const report = buildCiReport(85, null, detections, 70, false);
    expect(report.detections).toHaveLength(1);
    expect(report.detections[0]!.type).toBe('staleness');
    expect(report.detections[0]!.severity).toBe('critical');
    expect(report.detections[0]!.description).toContain('staleness');
  });

  it('includes suggestedAction when present', () => {
    const d: Detection = {
      type: 'contradiction',
      severity: 'warning',
      nodeIds: ['a', 'b'],
      description: 'Conflicting statements',
      suggestedAction: 'Resolve the contradiction',
    };
    const report = buildCiReport(95, null, [d], 70, false);
    expect(report.detections[0]!.suggestedAction).toBe('Resolve the contradiction');
  });
});

describe('formatMarkdown', () => {
  it('renders pass status with score', () => {
    const report: CiReport = {
      score: 85,
      previousScore: null,
      delta: null,
      detections: [],
      pass: true,
    };
    const md = formatMarkdown(report);
    expect(md).toContain('PASS');
    expect(md).toContain('85/100');
    expect(md).toContain('healthy');
  });

  it('renders fail status with issues table', () => {
    const report: CiReport = {
      score: 60,
      previousScore: 80,
      delta: -20,
      detections: [
        { type: 'contradiction', severity: 'critical', description: 'Conflict found' },
      ],
      pass: false,
    };
    const md = formatMarkdown(report);
    expect(md).toContain('FAIL');
    expect(md).toContain('60/100');
    expect(md).toContain('Conflict found');
    expect(md).toContain('-20');
    expect(md).toContain('| critical | contradiction |');
  });

  it('renders positive delta with arrow up', () => {
    const report: CiReport = {
      score: 90,
      previousScore: 80,
      delta: 10,
      detections: [],
      pass: true,
    };
    const md = formatMarkdown(report);
    expect(md).toContain('+10');
    expect(md).toContain('↑');
  });

  it('renders zero delta with right arrow', () => {
    const report: CiReport = {
      score: 80,
      previousScore: 80,
      delta: 0,
      detections: [],
      pass: true,
    };
    const md = formatMarkdown(report);
    expect(md).toContain('→');
  });

  it('omits previous score section when no history', () => {
    const report: CiReport = {
      score: 100,
      previousScore: null,
      delta: null,
      detections: [],
      pass: true,
    };
    const md = formatMarkdown(report);
    expect(md).not.toContain('Previous:');
  });
});

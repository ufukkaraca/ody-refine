// EXCEEDS_LIMIT: test fixture covering CI score, regression, fail-on, and markdown
/**
 * Tests for the CI command — score calculation, regression detection,
 * report building, severity-based failure, and markdown output formatting.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCiScore,
  buildCiReport,
  formatMarkdown,
  checkFailOnSeverity,
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

describe('checkFailOnSeverity', () => {
  it('returns null for "none" threshold', () => {
    const detections = [makeDetection('critical')];
    expect(checkFailOnSeverity(detections, 'none')).toBeNull();
  });

  it('returns "critical" when critical exists and threshold is critical', () => {
    const detections = [makeDetection('critical')];
    expect(checkFailOnSeverity(detections, 'critical')).toBe('critical');
  });

  it('returns null when no critical and threshold is critical', () => {
    const detections = [makeDetection('warning'), makeDetection('info')];
    expect(checkFailOnSeverity(detections, 'critical')).toBeNull();
  });

  it('returns "warning" when warning exists and threshold is warning', () => {
    const detections = [makeDetection('warning')];
    expect(checkFailOnSeverity(detections, 'warning')).toBe('warning');
  });

  it('returns "critical" when critical exists and threshold is warning', () => {
    const detections = [makeDetection('critical'), makeDetection('warning')];
    expect(checkFailOnSeverity(detections, 'warning')).toBe('critical');
  });

  it('returns null when only info and threshold is warning', () => {
    const detections = [makeDetection('info')];
    expect(checkFailOnSeverity(detections, 'warning')).toBeNull();
  });

  it('returns "info" when info exists and threshold is info', () => {
    const detections = [makeDetection('info')];
    expect(checkFailOnSeverity(detections, 'info')).toBe('info');
  });

  it('returns null for empty detections', () => {
    expect(checkFailOnSeverity([], 'critical')).toBeNull();
  });
});

describe('buildCiReport', () => {
  it('passes when score meets minimum health', () => {
    const report = buildCiReport(80, null, [], 70, false);
    expect(report.pass).toBe(true);
    expect(report.score).toBe(80);
    expect(report.previousScore).toBeNull();
    expect(report.delta).toBeNull();
    expect(report.failedOn).toBeNull();
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

  it('fails on critical when fail-on is critical', () => {
    const detections = [makeDetection('critical')];
    const report = buildCiReport(85, null, detections, 0, false, 'critical');
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe('critical');
  });

  it('passes on warning when fail-on is critical', () => {
    const detections = [makeDetection('warning')];
    const report = buildCiReport(95, null, detections, 0, false, 'critical');
    expect(report.pass).toBe(true);
    expect(report.failedOn).toBeNull();
  });

  it('fails on warning when fail-on is warning', () => {
    const detections = [makeDetection('warning')];
    const report = buildCiReport(95, null, detections, 0, false, 'warning');
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe('warning');
  });

  it('passes with no detections and any fail-on level', () => {
    const report = buildCiReport(100, null, [], 0, false, 'info');
    expect(report.pass).toBe(true);
    expect(report.failedOn).toBeNull();
  });

  it('never fails when fail-on is none', () => {
    const detections = [
      makeDetection('critical'),
      makeDetection('warning'),
      makeDetection('info'),
    ];
    const report = buildCiReport(79, null, detections, 0, false, 'none');
    expect(report.pass).toBe(true);
    expect(report.failedOn).toBeNull();
  });

  it('fails on both min-health and fail-on simultaneously', () => {
    const detections = [makeDetection('critical')];
    const report = buildCiReport(50, null, detections, 70, false, 'critical');
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe('critical');
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
      failedOn: null,
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
      failedOn: 'critical',
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
      failedOn: null,
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
      failedOn: null,
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
      failedOn: null,
    };
    const md = formatMarkdown(report);
    expect(md).not.toContain('Previous:');
  });

  it('renders failedOn severity in markdown', () => {
    const report: CiReport = {
      score: 85,
      previousScore: null,
      delta: null,
      detections: [
        { type: 'contradiction', severity: 'critical', description: 'A conflict' },
      ],
      pass: false,
      failedOn: 'critical',
    };
    const md = formatMarkdown(report);
    expect(md).toContain('Failed due to **critical** severity');
  });

  it('omits failedOn line when null', () => {
    const report: CiReport = {
      score: 100,
      previousScore: null,
      delta: null,
      detections: [],
      pass: true,
      failedOn: null,
    };
    const md = formatMarkdown(report);
    expect(md).not.toContain('Failed due to');
  });
});

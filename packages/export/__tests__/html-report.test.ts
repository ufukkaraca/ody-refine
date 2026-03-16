import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../src/html-report.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'critical',
    nodeIds: ['node-1', 'node-2'],
    description: 'Two nodes disagree on the deployment policy.',
    suggestedAction: 'Review and pick the correct version.',
    ...overrides,
  };
}

describe('generateHtmlReport', () => {
  it('produces valid HTML with DOCTYPE', () => {
    const html = generateHtmlReport([]);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('shows "No issues found" for zero detections', () => {
    const html = generateHtmlReport([]);
    expect(html).toContain('No issues found');
  });

  it('shows score 100 for zero detections', () => {
    const html = generateHtmlReport([]);
    expect(html).toContain('>100<');
  });

  it('includes detection type counts in summary', () => {
    const detections = [
      makeDetection({ type: 'contradiction' }),
      makeDetection({ type: 'contradiction' }),
      makeDetection({ type: 'staleness', severity: 'warning' }),
    ];
    const html = generateHtmlReport(detections);
    expect(html).toContain('contradiction');
    expect(html).toContain('staleness');
    // Should show count 2 for contradictions
    expect(html).toContain('>2<');
  });

  it('renders severity indicators', () => {
    const detections = [
      makeDetection({ severity: 'critical' }),
      makeDetection({ severity: 'warning', type: 'staleness' }),
      makeDetection({ severity: 'info', type: 'duplicate' }),
    ];
    const html = generateHtmlReport(detections);
    expect(html).toContain('class="severity critical"');
    expect(html).toContain('class="severity warning"');
    expect(html).toContain('class="severity info"');
    expect(html).toContain('class="detection critical"');
  });

  it('is self-contained with no external http links', () => {
    const detections = [makeDetection()];
    const html = generateHtmlReport(detections);
    // No external resources
    expect(html).not.toMatch(/https?:\/\//);
    // Has inline style
    expect(html).toContain('<style>');
  });

  it('includes stats when provided', () => {
    const html = generateHtmlReport([], {
      nodeCount: 42,
      durationMs: 1500,
    });
    expect(html).toContain('42 nodes analyzed');
    expect(html).toContain('1.5s');
  });

  it('escapes HTML in detection descriptions', () => {
    const detections = [
      makeDetection({ description: '<script>alert("xss")</script>' }),
    ];
    const html = generateHtmlReport(detections);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders suggested actions', () => {
    const detections = [
      makeDetection({ suggestedAction: 'Fix the conflict now.' }),
    ];
    const html = generateHtmlReport(detections);
    expect(html).toContain('Fix the conflict now.');
  });

  it('includes Ody Refine branding', () => {
    const html = generateHtmlReport([]);
    expect(html).toContain('Ody Refine Health Report');
  });
});

import { describe, it, expect } from 'vitest';
import type { Detection } from '@useody/platform-core';
import { detectionsToAnalysisResult } from '../src/detect/detections-to-analysis.js';
import type { PipelineStats } from '../src/detect/detections-to-analysis.js';

const STATS: PipelineStats = { fileCount: 5, durationMs: 1000 };

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'critical',
    nodeIds: ['node-1', 'node-2'],
    description: 'API rate limit: 1000/min vs 500/min',
    suggestedAction: 'Align the rate limit documentation.',
    metadata: {
      topic: 'Rate limit policy',
      claimA: '1000 requests per minute',
      claimB: '500 requests per minute',
      impact: 'Clients may exceed limit and get throttled',
    },
    ...overrides,
  };
}

describe('detectionsToAnalysisResult', () => {
  it('converts detections into an AnalysisResult', () => {
    const detections = [makeDetection()];
    const result = detectionsToAnalysisResult(detections, STATS);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.category).toBe('contradiction');
    expect(result.findings[0]!.severity).toBe('critical');
    expect(result.findings[0]!.headline).toBe('Rate limit policy');
    expect(result.metadata.documentCount).toBe(5);
    expect(result.metadata.totalTokens).toBe(0);
    expect(result.metadata.modelUsed).toBe('heuristic (no LLM)');
  });

  it('maps all detection types to finding categories', () => {
    const types: Array<[Detection['type'], string]> = [
      ['contradiction', 'contradiction'],
      ['staleness', 'stale_commitment'],
      ['undocumented', 'tribal_knowledge'],
      ['duplicate', 'duplicate_truth'],
      ['time_bomb', 'commitment_without_followthrough'],
    ];

    for (const [detType, findingCat] of types) {
      const result = detectionsToAnalysisResult(
        [makeDetection({ type: detType })],
        STATS,
      );
      expect(result.findings[0]!.category).toBe(findingCat);
    }
  });

  it('infers effort from severity', () => {
    const critical = detectionsToAnalysisResult(
      [makeDetection({ severity: 'critical', metadata: {} })],
      STATS,
    );
    expect(critical.findings[0]!.effort).toBe('major');

    const warning = detectionsToAnalysisResult(
      [makeDetection({ severity: 'warning', metadata: {} })],
      STATS,
    );
    expect(warning.findings[0]!.effort).toBe('medium');

    const info = detectionsToAnalysisResult(
      [makeDetection({ severity: 'info', metadata: {} })],
      STATS,
    );
    expect(info.findings[0]!.effort).toBe('quick_win');
  });

  it('extracts headline from metadata topic', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({ metadata: { topic: 'Deploy cadence' } })],
      STATS,
    );
    expect(result.findings[0]!.headline).toBe('Deploy cadence');
  });

  it('falls back to description prefix for headline when no topic', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({
        description: 'Rate limit: different numbers in two docs',
        metadata: {},
      })],
      STATS,
    );
    expect(result.findings[0]!.headline).toBe('Rate limit');
  });

  it('truncates long descriptions as headline', () => {
    const long = 'A'.repeat(100);
    const result = detectionsToAnalysisResult(
      [makeDetection({ description: long, metadata: {} })],
      STATS,
    );
    expect(result.findings[0]!.headline.length).toBeLessThanOrEqual(80);
    expect(result.findings[0]!.headline).toContain('...');
  });

  it('builds evidence from claimA/claimB metadata', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection()],
      STATS,
    );
    const evidence = result.findings[0]!.evidence;
    expect(evidence).toHaveLength(2);
    expect(evidence[0]!.quote).toBe('1000 requests per minute');
    expect(evidence[1]!.quote).toBe('500 requests per minute');
  });

  it('falls back to description as evidence when no claim metadata', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({ metadata: {} })],
      STATS,
    );
    const evidence = result.findings[0]!.evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.quote).toContain('rate limit');
  });

  it('computes health score from detections', () => {
    const detections: Detection[] = [
      makeDetection({ type: 'contradiction', severity: 'critical' }),
      makeDetection({ type: 'staleness', severity: 'warning' }),
    ];
    const result = detectionsToAnalysisResult(detections, STATS);

    // contradiction: critical => -15, staleness: warning => -5
    expect(result.healthScore.consistency).toBe(85);
    expect(result.healthScore.freshness).toBe(95);
    expect(result.healthScore.ownership).toBe(100);
    expect(result.healthScore.coverage).toBe(100);
    expect(result.healthScore.overall).toBeGreaterThan(0);
    expect(result.healthScore.overall).toBeLessThan(100);
  });

  it('returns perfect health for empty detections', () => {
    const result = detectionsToAnalysisResult([], STATS);
    expect(result.healthScore.overall).toBe(100);
    expect(result.healthScore.consistency).toBe(100);
    expect(result.findings).toHaveLength(0);
  });

  it('builds document map from detection metadata nodes', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({
        metadata: {
          nodes: [
            { id: 'n1', source: 'api.md', title: 'API Docs' },
            { id: 'n2', source: 'guide.md', title: 'Guide' },
          ],
        },
      })],
      STATS,
    );

    expect(result.documentMap).toHaveLength(2);
    expect(result.documentMap[0]!.path).toBe('api.md');
    expect(result.documentMap[1]!.path).toBe('guide.md');
  });

  it('deduplicates documents in document map', () => {
    const result = detectionsToAnalysisResult(
      [
        makeDetection({
          metadata: {
            nodes: [{ id: 'n1', source: 'api.md', title: 'API' }],
          },
        }),
        makeDetection({
          metadata: {
            nodes: [{ id: 'n1', source: 'api.md', title: 'API' }],
          },
        }),
      ],
      STATS,
    );

    expect(result.documentMap).toHaveLength(1);
  });

  it('uses suggestedAction as recommendation', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({ suggestedAction: 'Fix the rate limit docs' })],
      STATS,
    );
    expect(result.findings[0]!.recommendation).toBe('Fix the rate limit docs');
  });

  it('provides default recommendation when no suggestedAction', () => {
    const result = detectionsToAnalysisResult(
      [makeDetection({ suggestedAction: undefined })],
      STATS,
    );
    expect(result.findings[0]!.recommendation).toContain('Review');
  });
});

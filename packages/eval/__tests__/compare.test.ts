import { describe, it, expect } from 'vitest';
import type { EvalResult } from '../src/types.js';
import { compareBenchmarks } from '../src/compare.js';

function makeEvalResult(
  modelId: string,
  scores: Partial<EvalResult['scores']> = {},
): EvalResult {
  return {
    benchmarkId: 'bench-1',
    modelId,
    scores: {
      accuracy: 0.8,
      semanticSimilarity: 0.85,
      contradictionRate: 0.1,
      avgConfidence: 0.8,
      ...scores,
    },
    itemResults: [],
    runAt: new Date(),
  };
}

describe('compareBenchmarks', () => {
  it('candidate wins when all metrics improve', () => {
    const current = makeEvalResult('model-a', {
      accuracy: 0.7,
      semanticSimilarity: 0.75,
      contradictionRate: 0.2,
      avgConfidence: 0.7,
    });
    const candidate = makeEvalResult('model-b', {
      accuracy: 0.9,
      semanticSimilarity: 0.9,
      contradictionRate: 0.05,
      avgConfidence: 0.9,
    });

    const report = compareBenchmarks(current, candidate);

    expect(report.winner).toBe('model-b');
    expect(report.improvements.length).toBeGreaterThan(0);
    expect(report.regressions).toHaveLength(0);
  });

  it('current wins when candidate has regressions', () => {
    const current = makeEvalResult('model-a', { accuracy: 0.9 });
    const candidate = makeEvalResult('model-b', { accuracy: 0.7 });

    const report = compareBenchmarks(current, candidate);

    expect(report.winner).toBe('model-a');
    expect(report.regressions).toContain('accuracy');
  });

  it('returns null winner on tie (no changes)', () => {
    const current = makeEvalResult('model-a');
    const candidate = makeEvalResult('model-b');

    const report = compareBenchmarks(current, candidate);

    expect(report.winner).toBeNull();
    expect(report.regressions).toHaveLength(0);
    expect(report.improvements).toHaveLength(0);
  });

  it('treats higher contradictionRate as regression', () => {
    const current = makeEvalResult('model-a', { contradictionRate: 0.1 });
    const candidate = makeEvalResult('model-b', { contradictionRate: 0.3 });

    const report = compareBenchmarks(current, candidate);

    expect(report.regressions).toContain('contradictionRate');
  });

  it('treats lower contradictionRate as improvement', () => {
    const current = makeEvalResult('model-a', { contradictionRate: 0.3 });
    const candidate = makeEvalResult('model-b', { contradictionRate: 0.1 });

    const report = compareBenchmarks(current, candidate);

    expect(report.improvements).toContain('contradictionRate');
  });

  it('includes both models in report', () => {
    const current = makeEvalResult('model-a');
    const candidate = makeEvalResult('model-b');

    const report = compareBenchmarks(current, candidate);

    expect(report.models).toEqual(['model-a', 'model-b']);
  });

  it('calculates correct deltas', () => {
    const current = makeEvalResult('model-a', { accuracy: 0.6 });
    const candidate = makeEvalResult('model-b', { accuracy: 0.8 });

    const report = compareBenchmarks(current, candidate);

    expect(report.deltas['accuracy']).toBeCloseTo(0.2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runConsensusAnalysis } from '../src/consensus.js';
import { computeDeterministicHealthScore } from '../src/health-score.js';
import type { LLMProvider } from '@useody/platform-core';
import type { AnalysisInput, ConsultingFinding } from '../src/consultant-analysis.js';

/** Build a mock LLM that returns different responses per call. */
function makeLlm(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: vi.fn().mockImplementation((): Promise<string> => {
      const response = responses[callIndex % responses.length]!;
      callIndex++;
      return Promise.resolve(response);
    }),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-consensus-model'),
  };
}

function makeInput(): AnalysisInput {
  return {
    documents: [
      { path: 'handbook.md', title: 'Handbook', content: 'Vacation: 20 days.' },
      { path: 'onboarding.md', title: 'Onboarding', content: 'Vacation: 15 days.' },
    ],
  };
}

/** A stable finding appearing in every run. */
const STABLE_FINDING: ConsultingFinding = {
  category: 'contradiction',
  severity: 'critical',
  headline: 'Vacation policy: 20 days vs 15 days',
  evidence: [
    { source: 'handbook.md', quote: 'Vacation: 20 days.' },
    { source: 'onboarding.md', quote: 'Vacation: 15 days.' },
  ],
  businessImpact: 'Employees get inconsistent information.',
  recommendation: 'Align both documents.',
  effort: 'quick_win',
  affectedDocuments: ['handbook.md', 'onboarding.md'],
};

/** A sporadic finding that only appears once. */
const SPORADIC_FINDING: ConsultingFinding = {
  category: 'tribal_knowledge',
  severity: 'info',
  headline: 'Only one doc mentions lunch breaks',
  evidence: [{ source: 'handbook.md', quote: 'Lunch at 12pm.' }],
  businessImpact: 'Low risk.',
  recommendation: 'Document elsewhere.',
  effort: 'quick_win',
  affectedDocuments: ['handbook.md'],
};

function makeResponse(findings: ConsultingFinding[]): string {
  return JSON.stringify({
    findings,
    healthScore: { overall: 60, consistency: 40, freshness: 80, ownership: 70, coverage: 90 },
    documentMap: [
      { path: 'handbook.md', title: 'Handbook', topics: ['policy'] },
      { path: 'onboarding.md', title: 'Onboarding', topics: ['hr'] },
    ],
  });
}

describe('consensus voting', () => {
  it('keeps findings that appear in majority of runs', async () => {
    // All 3 runs find the contradiction, only run 2 finds sporadic
    const responses = [
      makeResponse([STABLE_FINDING]),
      makeResponse([STABLE_FINDING, SPORADIC_FINDING]),
      makeResponse([STABLE_FINDING]),
    ];
    const llm = makeLlm(responses);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.category).toBe('contradiction');
    expect(result.findings[0]!.headline).toContain('Vacation');
  });

  it('filters findings that appear in minority of runs', async () => {
    // Sporadic finding only in 1 of 3 runs
    const responses = [
      makeResponse([STABLE_FINDING]),
      makeResponse([SPORADIC_FINDING]),
      makeResponse([STABLE_FINDING]),
    ];
    const llm = makeLlm(responses);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    // Only contradiction kept (2/3), sporadic dropped (1/3)
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.category).toBe('contradiction');
  });

  it('keeps all findings when all runs agree', async () => {
    const both = makeResponse([STABLE_FINDING, SPORADIC_FINDING]);
    const llm = makeLlm([both, both, both]);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    expect(result.findings).toHaveLength(2);
  });

  it('returns zero findings when all runs disagree', async () => {
    // Each finding appears only once across 3 runs
    const f1: ConsultingFinding = { ...STABLE_FINDING, headline: 'Issue A: unique' };
    const f2: ConsultingFinding = {
      ...STABLE_FINDING, category: 'stale_commitment', headline: 'Issue B: unique stale',
    };
    const f3: ConsultingFinding = {
      ...STABLE_FINDING, category: 'ownership_gap', headline: 'Issue C: unique ownership',
    };

    const responses = [
      makeResponse([f1]),
      makeResponse([f2]),
      makeResponse([f3]),
    ];
    const llm = makeLlm(responses);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    expect(result.findings).toHaveLength(0);
  });

  it('handles zero findings across all runs', async () => {
    const empty = makeResponse([]);
    const llm = makeLlm([empty, empty, empty]);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    expect(result.findings).toHaveLength(0);
    expect(result.healthScore.overall).toBe(100);
  });

  it('uses deterministic health score, not LLM score', async () => {
    const response = makeResponse([STABLE_FINDING]);
    const llm = makeLlm([response, response, response]);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    // LLM said overall: 60, but deterministic should compute from findings
    const expected = computeDeterministicHealthScore(result.findings);
    expect(result.healthScore).toEqual(expected);
  });

  it('reports model name with pass count in metadata', async () => {
    const response = makeResponse([]);
    const llm = makeLlm([response, response, response]);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    expect(result.metadata.modelUsed).toContain('test-consensus-model');
    expect(result.metadata.modelUsed).toContain('3-pass consensus');
  });

  it('defaults to 3 passes when not specified', async () => {
    const response = makeResponse([]);
    const llm = makeLlm([response, response, response]);
    await runConsensusAnalysis(makeInput(), llm);

    expect(llm.complete).toHaveBeenCalledTimes(3);
  });

  it('supports configurable pass count', async () => {
    const response = makeResponse([]);
    const llm = makeLlm([response, response, response, response, response]);
    await runConsensusAnalysis(makeInput(), llm, { passes: 5 });

    expect(llm.complete).toHaveBeenCalledTimes(5);
  });

  it('merges evidence from multiple runs', async () => {
    const f1: ConsultingFinding = {
      ...STABLE_FINDING,
      evidence: [{ source: 'handbook.md', quote: 'Vacation: 20 days.' }],
    };
    const f2: ConsultingFinding = {
      ...STABLE_FINDING,
      evidence: [
        { source: 'handbook.md', quote: 'Vacation: 20 days.' },
        { source: 'onboarding.md', quote: 'Vacation: 15 days.' },
      ],
    };
    const responses = [makeResponse([f1]), makeResponse([f2]), makeResponse([f1])];
    const llm = makeLlm(responses);
    const result = await runConsensusAnalysis(makeInput(), llm, { passes: 3 });

    // Should merge and deduplicate evidence
    expect(result.findings[0]!.evidence.length).toBe(2);
  });
});

describe('deterministic health scoring', () => {
  it('returns perfect score with zero findings', () => {
    const score = computeDeterministicHealthScore([]);
    expect(score.overall).toBe(100);
    expect(score.consistency).toBe(100);
    expect(score.freshness).toBe(100);
    expect(score.ownership).toBe(100);
    expect(score.coverage).toBe(100);
  });

  it('produces identical results from identical findings', () => {
    const findings: ConsultingFinding[] = [STABLE_FINDING, SPORADIC_FINDING];
    const score1 = computeDeterministicHealthScore(findings);
    const score2 = computeDeterministicHealthScore(findings);

    expect(score1).toEqual(score2);
  });

  it('penalizes consistency for contradictions', () => {
    const findings: ConsultingFinding[] = [STABLE_FINDING]; // critical contradiction
    const score = computeDeterministicHealthScore(findings);

    expect(score.consistency).toBe(75); // 100 - 25 (critical)
    expect(score.freshness).toBe(100);
    expect(score.ownership).toBe(100);
    expect(score.coverage).toBe(100);
  });

  it('penalizes freshness for stale commitments', () => {
    const stale: ConsultingFinding = {
      ...STABLE_FINDING,
      category: 'stale_commitment',
      severity: 'warning',
    };
    const score = computeDeterministicHealthScore([stale]);

    expect(score.consistency).toBe(100);
    expect(score.freshness).toBe(92); // 100 - 8 (warning)
  });

  it('penalizes ownership for ownership gaps and decisions without context', () => {
    const gap: ConsultingFinding = {
      ...STABLE_FINDING,
      category: 'ownership_gap',
      severity: 'warning',
    };
    const decision: ConsultingFinding = {
      ...STABLE_FINDING,
      category: 'decision_without_context',
      severity: 'info',
    };
    const score = computeDeterministicHealthScore([gap, decision]);

    expect(score.ownership).toBe(89); // 100 - 8 - 3
  });

  it('penalizes coverage for tribal knowledge', () => {
    const tribal: ConsultingFinding = {
      ...STABLE_FINDING,
      category: 'tribal_knowledge',
      severity: 'info',
    };
    const score = computeDeterministicHealthScore([tribal]);

    expect(score.coverage).toBe(97); // 100 - 3
  });

  it('computes overall as weighted average', () => {
    const score = computeDeterministicHealthScore([STABLE_FINDING]);
    const expected = Math.round(
      75 * 0.35 + 100 * 0.25 + 100 * 0.2 + 100 * 0.2,
    );
    expect(score.overall).toBe(expected);
  });

  it('clamps dimensions to 0 minimum', () => {
    // 7 critical contradictions = 7 * 15 = 105 penalty
    const findings: ConsultingFinding[] = Array.from({ length: 7 }, () => ({
      ...STABLE_FINDING,
      category: 'contradiction' as const,
      severity: 'critical' as const,
    }));
    const score = computeDeterministicHealthScore(findings);

    expect(score.consistency).toBe(0);
    expect(score.overall).toBeGreaterThanOrEqual(0);
  });

  it('handles multiple finding types simultaneously', () => {
    const findings: ConsultingFinding[] = [
      { ...STABLE_FINDING, category: 'contradiction', severity: 'critical' },
      { ...STABLE_FINDING, category: 'stale_commitment', severity: 'warning' },
      { ...STABLE_FINDING, category: 'ownership_gap', severity: 'info' },
      { ...STABLE_FINDING, category: 'tribal_knowledge', severity: 'warning' },
    ];

    const score = computeDeterministicHealthScore(findings);

    expect(score.consistency).toBe(75); // 100 - 25
    expect(score.freshness).toBe(92);   // 100 - 8
    expect(score.ownership).toBe(97);   // 100 - 3
    expect(score.coverage).toBe(92);    // 100 - 8
  });
});

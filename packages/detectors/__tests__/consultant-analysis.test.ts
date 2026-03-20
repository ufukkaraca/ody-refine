import { describe, it, expect, vi } from 'vitest';
import { analyzeCorpus } from '../src/consultant-analysis.js';
import type { LLMProvider, ChatMessage } from '@useody/platform-core';
import type { AnalysisInput } from '../src/consultant-analysis.js';

function makeLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-model'),
  };
}

function makeInput(docs: Array<{ path: string; title: string; content: string }>): AnalysisInput {
  return { documents: docs.map((d) => ({ ...d })) };
}

const VALID_RESPONSE = JSON.stringify({
  findings: [
    {
      category: 'contradiction',
      severity: 'critical',
      headline: 'Customer commitments documented in three conflicting versions',
      evidence: [
        { source: 'docs/handbook.md', quote: 'We deploy every Monday.' },
        { source: 'docs/runbook.md', quote: 'Deployments happen every other Tuesday.' },
      ],
      businessImpact: 'This creates risk of delivering inconsistent deployment schedules to the ops team.',
      recommendation: 'Align both documents on a single deployment cadence.',
      effort: 'quick_win',
      affectedDocuments: ['docs/handbook.md', 'docs/runbook.md'],
    },
    {
      category: 'commitment_without_followthrough',
      severity: 'warning',
      headline: 'Q3 database migration committed but never completed',
      evidence: [
        { source: 'docs/migration.md', quote: 'Complete migration by end of Q3 2025.' },
      ],
      businessImpact: 'This creates risk of running on unsupported infrastructure without stakeholder awareness.',
      recommendation: 'Update migration plan with current timeline or formally cancel.',
      effort: 'medium',
      affectedDocuments: ['docs/migration.md'],
    },
    {
      category: 'decision_without_context',
      severity: 'info',
      headline: 'No documented rationale for choosing AWS over GCP',
      evidence: [
        { source: 'docs/handbook.md', quote: 'We use AWS for all production workloads.' },
      ],
      businessImpact: 'Decision reversal risk if architect leaves — no one knows why AWS was chosen.',
      recommendation: 'Document the decision rationale in an ADR.',
      effort: 'quick_win',
      affectedDocuments: ['docs/handbook.md'],
    },
  ],
  healthScore: { overall: 52, consistency: 35, freshness: 60, ownership: 55, coverage: 70 },
  documentMap: [
    { path: 'docs/handbook.md', title: 'Engineering Handbook', topics: ['deployments', 'infrastructure'], owner: 'Platform team' },
    { path: 'docs/runbook.md', title: 'Ops Runbook', topics: ['deployments', 'monitoring'] },
    { path: 'docs/migration.md', title: 'Migration Plan', topics: ['database', 'infrastructure'] },
  ],
});

describe('analyzeCorpus', () => {
  it('returns clean empty result for no documents', async () => {
    const llm = makeLlm('{}');
    const result = await analyzeCorpus({ documents: [] }, llm);
    expect(result.findings).toHaveLength(0);
    expect(result.healthScore.overall).toBe(100);
    expect(result.metadata.documentCount).toBe(0);
    expect(result.metadata.modelUsed).toBe('test-model');
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('parses valid LLM response into AnalysisResult', async () => {
    const input = makeInput([
      { path: 'docs/handbook.md', title: 'Engineering Handbook', content: 'Deploy every Monday.' },
      { path: 'docs/runbook.md', title: 'Ops Runbook', content: 'Deploy every other Tuesday.' },
      { path: 'docs/migration.md', title: 'Migration Plan', content: 'Migrate by Q3 2025.' },
    ]);
    const llm = makeLlm(VALID_RESPONSE);
    const result = await analyzeCorpus(input, llm);

    expect(result.findings).toHaveLength(3);
    expect(result.healthScore.overall).toBe(52);
    expect(result.healthScore.consistency).toBe(35);
    expect(result.metadata.documentCount).toBe(3);

    const contradiction = result.findings[0]!;
    expect(contradiction.category).toBe('contradiction');
    expect(contradiction.severity).toBe('critical');
    expect(contradiction.headline).toContain('conflicting versions');
    expect(contradiction.effort).toBe('quick_win');
    expect(contradiction.affectedDocuments).toHaveLength(2);

    const commitment = result.findings[1]!;
    expect(commitment.category).toBe('commitment_without_followthrough');

    const decision = result.findings[2]!;
    expect(decision.category).toBe('decision_without_context');
  });

  it('retries on JSON parse failure and succeeds', async () => {
    const llm: LLMProvider = {
      complete: vi.fn()
        .mockResolvedValueOnce('Here is my analysis: not json')
        .mockResolvedValueOnce(JSON.stringify({
          findings: [], healthScore: { overall: 80, consistency: 80, freshness: 80, ownership: 80, coverage: 80 },
          documentMap: [],
        })),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test-model'),
    };
    const input = makeInput([
      { path: 'a.md', title: 'Doc A', content: 'Content.' },
      { path: 'b.md', title: 'Doc B', content: 'More content.' },
    ]);

    const result = await analyzeCorpus(input, llm);

    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.healthScore.overall).toBe(80);

    // Verify retry message asks for valid JSON
    const retryCall = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[1]!;
    const retryMsgs = retryCall[0] as ChatMessage[];
    expect(retryMsgs[retryMsgs.length - 1]!.content).toContain('valid JSON');
  });

  it('returns empty result when both attempts fail', async () => {
    const llm: LLMProvider = {
      complete: vi.fn().mockResolvedValue('completely unparseable garbage'),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test-model'),
    };
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'Content.' },
      { path: 'b.md', title: 'B', content: 'Other content.' },
    ]);

    const result = await analyzeCorpus(input, llm);

    expect(result.findings).toHaveLength(0);
    expect(result.healthScore.overall).toBe(100); // empty result default
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('sends documents with delimiters in user message', async () => {
    const input = makeInput([
      { path: 'policies/remote.md', title: 'Remote Policy', content: 'Remote-first company.' },
      { path: 'hr/handbook.md', title: 'HR Handbook', content: 'Office days: Mon/Wed.' },
    ]);
    input.documents[0]!.lastModified = '2025-06-15';
    const llm = makeLlm(JSON.stringify({ findings: [], healthScore: { overall: 90 }, documentMap: [] }));

    await analyzeCorpus(input, llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const userMsg = (call[0] as ChatMessage[]).find((m) => m.role === 'user')!.content;
    expect(userMsg).toContain('--- DOCUMENT: policies/remote.md (Last modified: 2025-06-15) ---');
    expect(userMsg).toContain('--- DOCUMENT: hr/handbook.md ---');
    expect(userMsg).toContain('Remote-first company.');
  });

  it('filters malformed findings', async () => {
    const response = JSON.stringify({
      healthScore: { overall: 60 },
      findings: [
        { category: 'bogus', severity: 'critical', headline: 'Bad' },
        { category: 'stale_commitment', severity: 'warning', headline: 'Good one', evidence: [] },
        { category: 'contradiction', severity: 'bad_severity', headline: 'Bad severity', evidence: [] },
        null, 42, 'string',
      ],
      documentMap: [],
    });
    const llm = makeLlm(response);
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'test' },
      { path: 'b.md', title: 'B', content: 'test2' },
    ]);

    const result = await analyzeCorpus(input, llm);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.category).toBe('stale_commitment');
  });

  it('defaults missing effort to medium', async () => {
    const response = JSON.stringify({
      healthScore: { overall: 70 },
      findings: [{
        category: 'tribal_knowledge', severity: 'info',
        headline: 'Only one doc covers onboarding', evidence: [],
      }],
      documentMap: [],
    });
    const llm = makeLlm(response);
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'test' },
      { path: 'b.md', title: 'B', content: 'test2' },
    ]);

    const result = await analyzeCorpus(input, llm);
    expect(result.findings[0]!.effort).toBe('medium');
  });

  it('clamps health score dimensions to 0-100', async () => {
    const response = JSON.stringify({
      healthScore: { overall: 150, consistency: -20, freshness: 200, ownership: 50, coverage: 'bad' },
      findings: [], documentMap: [],
    });
    const llm = makeLlm(response);
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'test' },
      { path: 'b.md', title: 'B', content: 'test2' },
    ]);

    const result = await analyzeCorpus(input, llm);
    expect(result.healthScore.overall).toBe(100);
    expect(result.healthScore.consistency).toBe(0);
    expect(result.healthScore.freshness).toBe(100);
    expect(result.healthScore.ownership).toBe(50);
    expect(result.healthScore.coverage).toBe(0);
  });

  it('maps all 7 categories', async () => {
    const categories = [
      'contradiction', 'stale_commitment', 'ownership_gap', 'tribal_knowledge',
      'duplicate_truth', 'commitment_without_followthrough', 'decision_without_context',
    ];
    const findings = categories.map((cat) => ({
      category: cat, severity: 'info', headline: `Finding: ${cat}`,
      evidence: [], businessImpact: 'test', recommendation: 'fix', effort: 'quick_win',
      affectedDocuments: [],
    }));
    const llm = makeLlm(JSON.stringify({
      healthScore: { overall: 30 }, findings, documentMap: [],
    }));
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'test' },
      { path: 'b.md', title: 'B', content: 'test2' },
    ]);

    const result = await analyzeCorpus(input, llm);
    expect(result.findings).toHaveLength(7);
    result.findings.forEach((f, i) => {
      expect(f.category).toBe(categories[i]);
    });
  });

  it('merges documentMap from LLM with input metadata', async () => {
    const input: AnalysisInput = {
      documents: [
        { path: 'a.md', title: 'Doc A', content: 'test', lastModified: '2025-01-01' },
        { path: 'b.md', title: 'Doc B', content: 'test' },
      ],
    };
    const response = JSON.stringify({
      healthScore: { overall: 80 }, findings: [],
      documentMap: [
        { path: 'a.md', title: 'Doc A', topics: ['deployments', 'CI'], owner: 'Platform team' },
      ],
    });
    const llm = makeLlm(response);

    const result = await analyzeCorpus(input, llm);
    expect(result.documentMap).toHaveLength(2);
    expect(result.documentMap[0]!.topics).toEqual(['deployments', 'CI']);
    expect(result.documentMap[0]!.owner).toBe('Platform team');
    expect(result.documentMap[0]!.lastModified).toBe('2025-01-01');
    expect(result.documentMap[1]!.topics).toEqual([]);
    expect(result.documentMap[1]!.owner).toBeUndefined();
  });

  it('uses low temperature and computes metadata', async () => {
    const input = makeInput([
      { path: 'a.md', title: 'A', content: 'A'.repeat(400) },
      { path: 'b.md', title: 'B', content: 'B'.repeat(400) },
    ]);
    const llm = makeLlm(JSON.stringify({
      healthScore: { overall: 90 }, findings: [], documentMap: [],
    }));

    const result = await analyzeCorpus(input, llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1] as { temperature: number }).temperature).toBe(0);
    expect(result.metadata.documentCount).toBe(2);
    expect(result.metadata.totalTokens).toBe(200); // 800 chars / 4
    expect(result.metadata.modelUsed).toBe('test-model');
    expect(result.metadata.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('single document returns early without calling LLM', async () => {
    const input = makeInput([{ path: 'solo.md', title: 'Solo Doc', content: 'Updated Q1 2024.' }]);
    const llm = makeLlm('should not be called');

    const result = await analyzeCorpus(input, llm);
    expect(result.findings).toHaveLength(0);
    expect(result.healthScore.overall).toBe(100);
    expect(result.healthScore.consistency).toBe(100);
    expect(result.documentMap).toHaveLength(1);
    expect(result.documentMap[0]!.path).toBe('solo.md');
    expect(result.metadata.documentCount).toBe(1);
    expect(result.metadata.totalTokens).toBe(0);
    expect(llm.complete).not.toHaveBeenCalled();
  });
});

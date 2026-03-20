import { describe, it, expect, vi } from 'vitest';
import { runConsensusAnalysis } from '../src/consensus.js';
import type { LLMProvider } from '@useody/platform-core';
import type { AnalysisInput } from '../src/consultant-analysis.js';

function makeInput(count: number): AnalysisInput {
  return {
    documents: Array.from({ length: count }, (_, i) => ({
      path: `doc${String(i)}.md`,
      title: `Doc ${String(i)}`,
      content: `Content for document ${String(i)}`,
    })),
  };
}

const FINDING_RESPONSE = JSON.stringify({
  findings: [
    {
      category: 'contradiction',
      severity: 'warning',
      headline: 'Conflicting deployment schedules',
      evidence: [{ source: 'doc0.md', quote: 'Deploy Monday' }],
      businessImpact: 'Risk',
      recommendation: 'Fix it',
      effort: 'quick_win',
      affectedDocuments: ['doc0.md', 'doc1.md'],
    },
  ],
  healthScore: { overall: 60 },
  documentMap: [],
});

const EMPTY_RESPONSE = JSON.stringify({
  findings: [],
  healthScore: { overall: 100 },
  documentMap: [],
});

function makeLlm(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: vi.fn().mockImplementation(async () => {
      const resp = responses[callIndex % responses.length]!;
      callIndex++;
      return resp;
    }),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-model'),
  };
}

describe('runConsensusAnalysis', () => {
  it('keeps findings appearing in majority of passes (default threshold)', async () => {
    // Finding appears in all 3 passes → survives majority (2/3)
    const llm = makeLlm([FINDING_RESPONSE, FINDING_RESPONSE, FINDING_RESPONSE]);
    const result = await runConsensusAnalysis(makeInput(3), llm, { passes: 3 });
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('filters findings appearing in only 1 of 3 passes (default threshold)', async () => {
    // Finding appears in only 1 pass → filtered by majority (needs 2/3)
    const llm = makeLlm([FINDING_RESPONSE, EMPTY_RESPONSE, EMPTY_RESPONSE]);
    const result = await runConsensusAnalysis(makeInput(3), llm, { passes: 3 });
    expect(result.findings).toHaveLength(0);
  });

  it('respects minVotes=1 to keep findings from a single pass', async () => {
    // Finding appears in only 1 pass, but minVotes=1 → survives
    const llm = makeLlm([FINDING_RESPONSE, EMPTY_RESPONSE, EMPTY_RESPONSE]);
    const result = await runConsensusAnalysis(makeInput(3), llm, {
      passes: 3,
      minVotes: 1,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.headline).toContain('deployment');
  });

  it('uses ceil(passes/2) as default threshold when minVotes not set', async () => {
    // 3 passes → threshold=2, finding in 1 pass → filtered
    const llm = makeLlm([FINDING_RESPONSE, EMPTY_RESPONSE, EMPTY_RESPONSE]);
    const result = await runConsensusAnalysis(makeInput(3), llm, { passes: 3 });
    expect(result.findings).toHaveLength(0);

    // Same but finding in 2 passes → kept
    const llm2 = makeLlm([FINDING_RESPONSE, FINDING_RESPONSE, EMPTY_RESPONSE]);
    const result2 = await runConsensusAnalysis(makeInput(3), llm2, { passes: 3 });
    expect(result2.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('handles all passes failing gracefully', async () => {
    const llm: LLMProvider = {
      complete: vi.fn().mockRejectedValue(new Error('LLM down')),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test-model'),
    };
    const result = await runConsensusAnalysis(makeInput(3), llm, { passes: 2 });
    expect(result.findings).toHaveLength(0);
  });

  it('includes model info with pass count in metadata', async () => {
    const llm = makeLlm([EMPTY_RESPONSE]);
    const result = await runConsensusAnalysis(makeInput(2), llm, { passes: 2 });
    expect(result.metadata.modelUsed).toContain('2-pass consensus');
  });

  it('runs passes in parallel (all start before any completes)', async () => {
    const events: string[] = [];
    const resolvers: Array<(v: string) => void> = [];
    const llm: LLMProvider = {
      complete: vi.fn().mockImplementation(() => {
        const idx = resolvers.length;
        events.push(`start-${String(idx)}`);
        return new Promise<string>((resolve) => {
          resolvers.push((v: string) => {
            events.push(`end-${String(idx)}`);
            resolve(v);
          });
        });
      }),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test-model'),
    };

    const promise = runConsensusAnalysis(makeInput(3), llm, { passes: 3 });

    // All 3 passes should have started before resolving any
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    expect(events).toEqual(['start-0', 'start-1', 'start-2']);

    // Resolve all in reverse order
    resolvers[2]!(EMPTY_RESPONSE);
    resolvers[1]!(FINDING_RESPONSE);
    resolvers[0]!(FINDING_RESPONSE);

    const result = await promise;
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(events).toContain('end-0');
    expect(events).toContain('end-1');
    expect(events).toContain('end-2');
  });
});

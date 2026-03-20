import { describe, it, expect, vi } from 'vitest';
import type { EvalResult } from '../src/types.js';
import type { LLMProvider, ChatMessage } from '@useody/platform-core';
import { evaluateGate } from '../src/eval-gate.js';
import {
  runEvalGate,
  runBaselineComparison,
  forgeQuestionsToBenchmark,
  baselineQuestionsToBenchmark,
} from '../src/baseline-eval.js';

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

/** Create a mock LLM that returns a fixed answer. */
function mockLLM(modelId: string, answer: string): LLMProvider {
  return {
    complete: vi.fn(async (_msgs: ChatMessage[]): Promise<string> => answer),
    stream: async function* (_msgs: ChatMessage[]): AsyncGenerator<string, void, unknown> {
      yield answer;
    },
    getModelId: (): string => modelId,
  };
}

describe('evaluateGate', () => {
  it('passes when candidate is better on all metrics', () => {
    const current = makeEvalResult('model-a', {
      accuracy: 0.7,
      semanticSimilarity: 0.7,
      contradictionRate: 0.2,
      avgConfidence: 0.7,
    });
    const candidate = makeEvalResult('model-b', {
      accuracy: 0.9,
      semanticSimilarity: 0.9,
      contradictionRate: 0.05,
      avgConfidence: 0.9,
    });

    const gate = evaluateGate(current, candidate);

    expect(gate.passed).toBe(true);
    expect(gate.regressions).toHaveLength(0);
    expect(gate.reasoning).toContain('No regressions');
  });

  it('passes when candidate equals current (no regression)', () => {
    const current = makeEvalResult('model-a');
    const candidate = makeEvalResult('model-b');

    const gate = evaluateGate(current, candidate);

    expect(gate.passed).toBe(true);
    expect(gate.regressions).toHaveLength(0);
  });

  it('fails on single accuracy regression', () => {
    const current = makeEvalResult('model-a', { accuracy: 0.9 });
    const candidate = makeEvalResult('model-b', { accuracy: 0.7 });

    const gate = evaluateGate(current, candidate);

    expect(gate.passed).toBe(false);
    expect(gate.regressions).toHaveLength(1);
    expect(gate.regressions[0].metric).toBe('accuracy');
    expect(gate.reasoning).toContain('accuracy');
  });

  it('fails when contradictionRate increases', () => {
    const current = makeEvalResult('model-a', { contradictionRate: 0.05 });
    const candidate = makeEvalResult('model-b', { contradictionRate: 0.2 });

    const gate = evaluateGate(current, candidate);

    expect(gate.passed).toBe(false);
    expect(gate.regressions[0].metric).toBe('contradictionRate');
  });

  it('fails with multiple regressions', () => {
    const current = makeEvalResult('model-a', {
      accuracy: 0.9,
      semanticSimilarity: 0.9,
    });
    const candidate = makeEvalResult('model-b', {
      accuracy: 0.5,
      semanticSimilarity: 0.5,
    });

    const gate = evaluateGate(current, candidate);

    expect(gate.passed).toBe(false);
    expect(gate.regressions.length).toBeGreaterThanOrEqual(2);
  });

  it('includes model IDs in result', () => {
    const current = makeEvalResult('model-a');
    const candidate = makeEvalResult('model-b');

    const gate = evaluateGate(current, candidate);

    expect(gate.currentModelId).toBe('model-a');
    expect(gate.candidateModelId).toBe('model-b');
  });

  it('provides detailed regression info', () => {
    const current = makeEvalResult('model-a', { accuracy: 0.95 });
    const candidate = makeEvalResult('model-b', { accuracy: 0.80 });

    const gate = evaluateGate(current, candidate);

    expect(gate.regressions[0]).toEqual({
      metric: 'accuracy',
      current: 0.95,
      candidate: 0.80,
    });
    expect(gate.reasoning).toContain('0.950');
    expect(gate.reasoning).toContain('0.800');
  });
});

describe('runEvalGate (integrated)', () => {
  it('passes when candidate model gives better answers', async () => {
    const benchmark = forgeQuestionsToBenchmark([
      {
        id: 'q-1',
        question: 'How many engineers?',
        correctAnswer: '12 engineers across 3 squads',
        incorrectAnswer: '8 engineers',
        domain: 'headcount',
        source: 'eng-01',
      },
    ]);

    // Current model gives wrong answer, candidate gives right answer
    const current = mockLLM('old-model', '8 engineers');
    const candidate = mockLLM('new-model', '12 engineers across 3 squads');

    const result = await runEvalGate(current, candidate, benchmark);

    expect(result.passed).toBe(true);
    expect(result.candidateResult.scores.accuracy).toBeGreaterThan(
      result.currentResult.scores.accuracy,
    );
  });

  it('fails when candidate model gives worse answers', async () => {
    const benchmark = forgeQuestionsToBenchmark([
      {
        id: 'q-1',
        question: 'How many engineers?',
        correctAnswer: '12 engineers across 3 squads',
        incorrectAnswer: '8 engineers',
        domain: 'headcount',
        source: 'eng-01',
      },
    ]);

    // Current model gives right answer, candidate gives wrong answer
    const current = mockLLM('old-model', '12 engineers across 3 squads');
    const candidate = mockLLM('new-model', '8 engineers');

    const result = await runEvalGate(current, candidate, benchmark);

    expect(result.passed).toBe(false);
    expect(result.regressions.length).toBeGreaterThan(0);
  });

  it('passes when both models give equally good answers', async () => {
    const benchmark = forgeQuestionsToBenchmark([
      {
        id: 'q-1',
        question: 'How many engineers?',
        correctAnswer: '12 engineers across 3 squads',
        incorrectAnswer: '8 engineers',
        domain: 'headcount',
        source: 'eng-01',
      },
    ]);

    const current = mockLLM('old-model', '12 engineers across 3 squads');
    const candidate = mockLLM('new-model', '12 engineers across 3 squads');

    const result = await runEvalGate(current, candidate, benchmark);

    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });
});

describe('runBaselineComparison', () => {
  it('reports per-question winners for baseline vs fine-tuned', async () => {
    const benchmark = baselineQuestionsToBenchmark([
      {
        id: 'bl-01',
        question: 'How many engineers?',
        correctAnswer: '12 engineers across 3 squads',
        whyBaselineFails: 'Sees both 12 and 8',
      },
      {
        id: 'bl-02',
        question: 'What is the uptime SLA?',
        correctAnswer: '99.99% per month',
        whyBaselineFails: 'Both values in docs',
      },
    ]);

    const base = mockLLM('gpt-4', 'The team has either 8 or 12 engineers');
    const fineTuned = mockLLM('ody-v1', '12 engineers across 3 squads');

    const result = await runBaselineComparison(base, fineTuned, benchmark);

    expect(result.perQuestion).toHaveLength(2);
    expect(result.perQuestion[0].winner).toBe('fine-tuned');
    expect(result.fineTunedResult.scores.accuracy).toBeGreaterThan(0);
  });
});

describe('benchmark converters', () => {
  it('forgeQuestionsToBenchmark converts correctly', () => {
    const questions = [
      {
        id: 'q-1',
        question: 'Test?',
        correctAnswer: 'Yes',
        incorrectAnswer: 'No',
        domain: 'test',
        source: 'src-1',
      },
    ];
    const benchmark = forgeQuestionsToBenchmark(questions, 'test-bench');
    expect(benchmark.id).toBe('test-bench');
    expect(benchmark.items).toHaveLength(1);
    expect(benchmark.items[0].expectedAnswer).toBe('Yes');
    expect(benchmark.items[0].domain).toBe('test');
  });

  it('baselineQuestionsToBenchmark converts correctly', () => {
    const questions = [
      {
        id: 'bl-1',
        question: 'Test?',
        correctAnswer: 'Answer',
        whyBaselineFails: 'reason',
      },
    ];
    const benchmark = baselineQuestionsToBenchmark(questions, 'bl-bench');
    expect(benchmark.id).toBe('bl-bench');
    expect(benchmark.items).toHaveLength(1);
    expect(benchmark.items[0].expectedAnswer).toBe('Answer');
    expect(benchmark.items[0].difficulty).toBe('hard');
  });
});

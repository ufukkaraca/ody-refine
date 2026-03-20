/**
 * Baseline evaluation — converts fixture questions into benchmarks
 * and runs head-to-head comparisons (fine-tuned vs base model).
 * @module eval/baseline-eval
 */

import type { LLMProvider } from '@useody/platform-core';
import type { Benchmark, EvalItem, EvalResult } from './types.js';
import type { ForgeEvalQuestion, BaselineQuestion } from './corpus-types.js';
import { runBenchmark, runHeadToHead } from './runner.js';
import type { RunBenchmarkOptions } from './runner.js';
import { evaluateGate } from './eval-gate.js';

/** Result of a baseline comparison test. */
export interface BaselineComparisonResult {
  baselineResult: EvalResult;
  fineTunedResult: EvalResult;
  gatePassed: boolean;
  reasoning: string;
  perQuestion: Array<{
    questionId: string;
    question: string;
    groundTruth: string;
    baselineAnswer: string;
    fineTunedAnswer: string;
    baselineAccuracy: number;
    fineTunedAccuracy: number;
    winner: 'baseline' | 'fine-tuned' | 'tie';
  }>;
}

/**
 * Convert ForgeEvalQuestion[] to a Benchmark.
 * Maps correctAnswer to expectedAnswer for the runner.
 */
export function forgeQuestionsToBenchmark(
  questions: ForgeEvalQuestion[],
  benchmarkId?: string,
): Benchmark {
  const items: EvalItem[] = questions.map((q) => ({
    id: q.id,
    question: q.question,
    expectedAnswer: q.correctAnswer,
    domain: q.domain,
    difficulty: 'medium' as const,
    sourceNodeIds: [q.source],
  }));

  return {
    id: benchmarkId ?? `forge-eval-${Date.now()}`,
    name: 'Forge Eval Questions',
    items,
    datasetVersion: '1.0.0',
    createdAt: new Date(),
  };
}

/**
 * Convert BaselineQuestion[] to a Benchmark.
 * These are questions where the fine-tuned model should beat the base.
 */
export function baselineQuestionsToBenchmark(
  questions: BaselineQuestion[],
  benchmarkId?: string,
): Benchmark {
  const items: EvalItem[] = questions.map((q) => ({
    id: q.id,
    question: q.question,
    expectedAnswer: q.correctAnswer,
    domain: 'baseline',
    difficulty: 'hard' as const,
    sourceNodeIds: [],
  }));

  return {
    id: benchmarkId ?? `beats-baseline-${Date.now()}`,
    name: 'Beats Baseline',
    items,
    datasetVersion: '1.0.0',
    createdAt: new Date(),
  };
}

/**
 * Run the "beats baseline" test: fine-tuned model vs base model
 * on domain questions with known ground truth.
 */
export async function runBaselineComparison(
  baseModel: LLMProvider,
  fineTunedModel: LLMProvider,
  benchmark: Benchmark,
  options?: RunBenchmarkOptions,
): Promise<BaselineComparisonResult> {
  const { resultA, resultB } = await runHeadToHead(
    baseModel,
    fineTunedModel,
    benchmark,
    options,
  );

  const perQuestion = benchmark.items.map((item, i) => {
    const baseItem = resultA.itemResults[i]!;
    const ftItem = resultB.itemResults[i]!;
    const bAcc = baseItem.scores.accuracy;
    const ftAcc = ftItem.scores.accuracy;
    return {
      questionId: item.id,
      question: item.question,
      groundTruth: item.expectedAnswer,
      baselineAnswer: baseItem.modelAnswer,
      fineTunedAnswer: ftItem.modelAnswer,
      baselineAccuracy: bAcc,
      fineTunedAccuracy: ftAcc,
      winner: ftAcc > bAcc
        ? 'fine-tuned' as const
        : bAcc > ftAcc
          ? 'baseline' as const
          : 'tie' as const,
    };
  });

  const gate = evaluateGate(resultA, resultB);

  return {
    baselineResult: resultA,
    fineTunedResult: resultB,
    gatePassed: gate.passed,
    reasoning: gate.reasoning,
    perQuestion,
  };
}

/**
 * Run eval gate: candidate model vs current model on a benchmark.
 * Returns { passed, currentResult, candidateResult, gate }.
 */
export async function runEvalGate(
  currentModel: LLMProvider,
  candidateModel: LLMProvider,
  benchmark: Benchmark,
  options?: RunBenchmarkOptions,
): Promise<{
  passed: boolean;
  currentResult: EvalResult;
  candidateResult: EvalResult;
  reasoning: string;
  regressions: Array<{ metric: string; current: number; candidate: number }>;
}> {
  const [currentResult, candidateResult] = await Promise.all([
    runBenchmark(currentModel, benchmark, options),
    runBenchmark(candidateModel, benchmark, options),
  ]);

  const gate = evaluateGate(currentResult, candidateResult);

  return {
    passed: gate.passed,
    currentResult,
    candidateResult,
    reasoning: gate.reasoning,
    regressions: gate.regressions,
  };
}

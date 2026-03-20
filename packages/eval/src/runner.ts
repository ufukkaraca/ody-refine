/**
 * Benchmark runner — evaluates a model against a benchmark.
 * Supports both standard and contradiction-specific benchmarks.
 * @module eval/runner
 */

import type { LLMProvider, EmbeddingProvider } from '@useody/platform-core';
import type { Benchmark, EvalResult, ItemResult } from './types.js';
import {
  calculateAccuracy,
  calculateSemanticSimilarity,
  detectContradiction,
  calculateNgramOverlap,
} from './metrics.js';

/** Options for running a benchmark. */
export interface RunBenchmarkOptions {
  /** Optional embedding provider for semantic similarity scoring. */
  embeddingProvider?: EmbeddingProvider;
  /** Optional embedding function (legacy). Prefer embeddingProvider. */
  embedFn?: (text: string) => Promise<number[]>;
  /** If true, use ROUGE-L scoring instead of keyword overlap. */
  useNgramScoring?: boolean;
  /** Optional progress callback. */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Run a benchmark against a model, scoring each item.
 * Returns aggregated eval results.
 */
export async function runBenchmark(
  model: LLMProvider,
  benchmark: Benchmark,
  options?: RunBenchmarkOptions,
): Promise<EvalResult> {
  const itemResults: ItemResult[] = [];
  const total = benchmark.items.length;

  for (let i = 0; i < total; i++) {
    const item = benchmark.items[i]!;
    const modelAnswer = await model.complete([
      { role: 'user', content: item.question },
    ]);

    const accuracy = options?.useNgramScoring
      ? calculateNgramOverlap(item.expectedAnswer, modelAnswer)
      : calculateAccuracy(item.expectedAnswer, modelAnswer);
    const contradicts = detectContradiction(
      item.expectedAnswer,
      modelAnswer,
    );

    let similarity = accuracy;
    const embedFn = options?.embeddingProvider
      ? (text: string): Promise<number[]> =>
          options.embeddingProvider!.embed(text)
      : options?.embedFn;
    if (embedFn) {
      const [expectedEmb, actualEmb] = await Promise.all([
        embedFn(item.expectedAnswer),
        embedFn(modelAnswer),
      ]);
      similarity = calculateSemanticSimilarity(expectedEmb, actualEmb);
    }

    itemResults.push({
      itemId: item.id,
      modelAnswer,
      scores: { accuracy, similarity, contradicts },
    });

    options?.onProgress?.(i + 1, total);
  }

  return aggregateResults(benchmark.id, model.getModelId(), itemResults);
}

/**
 * Run a head-to-head comparison: two models on the same benchmark.
 * Returns both eval results for comparison.
 */
export async function runHeadToHead(
  modelA: LLMProvider,
  modelB: LLMProvider,
  benchmark: Benchmark,
  options?: RunBenchmarkOptions,
): Promise<{ resultA: EvalResult; resultB: EvalResult }> {
  const [resultA, resultB] = await Promise.all([
    runBenchmark(modelA, benchmark, options),
    runBenchmark(modelB, benchmark, options),
  ]);
  return { resultA, resultB };
}

/** Aggregate item results into an EvalResult. */
function aggregateResults(
  benchmarkId: string,
  modelId: string,
  itemResults: ItemResult[],
): EvalResult {
  const total = itemResults.length;
  if (total === 0) {
    return {
      benchmarkId, modelId,
      scores: { accuracy: 0, semanticSimilarity: 0, contradictionRate: 0, avgConfidence: 0 },
      itemResults: [], runAt: new Date(),
    };
  }

  const avgAccuracy =
    itemResults.reduce((s, r) => s + r.scores.accuracy, 0) / total;
  const avgSimilarity =
    itemResults.reduce((s, r) => s + r.scores.similarity, 0) / total;
  const contradictionRate =
    itemResults.filter((r) => r.scores.contradicts).length / total;

  return {
    benchmarkId, modelId,
    scores: {
      accuracy: avgAccuracy,
      semanticSimilarity: avgSimilarity,
      contradictionRate,
      avgConfidence: avgAccuracy,
    },
    itemResults, runAt: new Date(),
  };
}


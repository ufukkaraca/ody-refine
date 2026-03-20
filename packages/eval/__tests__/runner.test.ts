import { describe, it, expect } from 'vitest';
import type { LLMProvider, ChatMessage, EmbeddingProvider } from '@useody/platform-core';
import type { Benchmark } from '../src/types.js';
import { runBenchmark } from '../src/runner.js';

function makeMockLLM(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: async (_messages: ChatMessage[]): Promise<string> => {
      const response = responses[callIndex] ?? '';
      callIndex++;
      return response;
    },
    stream: async function* (_messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
      yield '';
    },
    getModelId: (): string => 'mock-model-v1',
  };
}

function makeBenchmark(itemCount: number): Benchmark {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    question: `What do you know about: Topic ${i}?`,
    expectedAnswer: `Topic ${i} is about testing software quality`,
    domain: 'general',
    difficulty: 'easy' as const,
    sourceNodeIds: [`node-${i}`],
  }));

  return {
    id: 'bench-1',
    name: 'test-benchmark',
    items,
    datasetVersion: '1.0.0',
    createdAt: new Date(),
  };
}

describe('runBenchmark', () => {
  it('runs all items and returns aggregated results', async () => {
    const benchmark = makeBenchmark(2);
    const model = makeMockLLM([
      'Topic 0 is about testing software quality',
      'Topic 1 is about testing software quality',
    ]);

    const result = await runBenchmark(model, benchmark);

    expect(result.benchmarkId).toBe('bench-1');
    expect(result.modelId).toBe('mock-model-v1');
    expect(result.itemResults).toHaveLength(2);
    expect(result.scores.accuracy).toBeGreaterThan(0);
  });

  it('handles empty benchmark', async () => {
    const benchmark = makeBenchmark(0);
    const model = makeMockLLM([]);

    const result = await runBenchmark(model, benchmark);

    expect(result.itemResults).toHaveLength(0);
    expect(result.scores.accuracy).toBe(0);
    expect(result.scores.semanticSimilarity).toBe(0);
    expect(result.scores.contradictionRate).toBe(0);
  });

  it('detects contradictions in model responses', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM([
      'Topic does not involve testing software at all',
    ]);

    const result = await runBenchmark(model, benchmark);

    expect(result.itemResults[0].scores.contradicts).toBe(true);
    expect(result.scores.contradictionRate).toBe(1);
  });

  it('calculates accuracy based on keyword overlap', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM(['completely unrelated answer about cooking']);

    const result = await runBenchmark(model, benchmark);

    expect(result.itemResults[0].scores.accuracy).toBeLessThan(0.5);
  });

  it('sets runAt date', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM(['answer']);

    const result = await runBenchmark(model, benchmark);

    expect(result.runAt).toBeInstanceOf(Date);
  });

  it('uses embedding provider for semantic similarity when provided', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM(['completely different answer about cooking']);

    // Mock embedding provider: returns distinct vectors for different texts
    const embeddingProvider: EmbeddingProvider = {
      embed: async (text: string): Promise<number[]> => {
        if (text.includes('Topic')) return [1, 0, 0];
        return [0, 1, 0]; // orthogonal → similarity ≈ 0
      },
      embedBatch: async (texts: string[]): Promise<number[][]> => {
        const results: number[][] = [];
        for (const t of texts) {
          results.push(t.includes('Topic') ? [1, 0, 0] : [0, 1, 0]);
        }
        return results;
      },
      getModelId: (): string => 'mock-embedding',
      getDimension: (): number => 3,
    };

    const result = await runBenchmark(model, benchmark, { embeddingProvider });

    // Cosine similarity of orthogonal vectors = 0
    expect(result.scores.semanticSimilarity).toBeCloseTo(0);
    expect(result.itemResults[0]!.scores.similarity).toBeCloseTo(0);
    // Accuracy is still keyword-based
    expect(result.scores.accuracy).toBeDefined();
  });

  it('computes high semantic similarity for similar embeddings', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM([
      'Topic 0 is about testing software quality',
    ]);

    // Mock: same-ish vectors for similar text
    const embeddingProvider: EmbeddingProvider = {
      embed: async (_text: string): Promise<number[]> => [0.9, 0.1, 0.0],
      embedBatch: async (texts: string[]): Promise<number[][]> =>
        texts.map(() => [0.9, 0.1, 0.0]),
      getModelId: (): string => 'mock-embedding',
      getDimension: (): number => 3,
    };

    const result = await runBenchmark(model, benchmark, { embeddingProvider });

    // Identical vectors → cosine similarity = 1
    expect(result.scores.semanticSimilarity).toBeCloseTo(1);
  });

  it('falls back to keyword overlap when no embedding provider', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM([
      'Topic 0 is about testing software quality',
    ]);

    const result = await runBenchmark(model, benchmark);

    // Without embedding provider, similarity == accuracy (keyword overlap)
    expect(result.scores.semanticSimilarity).toBe(result.scores.accuracy);
  });

  it('supports legacy embedFn option', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM(['different answer']);

    const embedFn = async (text: string): Promise<number[]> => {
      return text.includes('Topic') ? [1, 0, 0] : [0, 0, 1];
    };

    const result = await runBenchmark(model, benchmark, { embedFn });

    // Orthogonal vectors → similarity ≈ 0
    expect(result.scores.semanticSimilarity).toBeCloseTo(0);
  });

  it('prefers embeddingProvider over embedFn when both provided', async () => {
    const benchmark = makeBenchmark(1);
    const model = makeMockLLM(['answer']);
    let providerCalled = false;
    let embedFnCalled = false;

    const embeddingProvider: EmbeddingProvider = {
      embed: async (_text: string): Promise<number[]> => {
        providerCalled = true;
        return [1, 0, 0];
      },
      embedBatch: async (texts: string[]): Promise<number[][]> =>
        texts.map(() => [1, 0, 0]),
      getModelId: (): string => 'mock-embedding',
      getDimension: (): number => 3,
    };

    const embedFn = async (_text: string): Promise<number[]> => {
      embedFnCalled = true;
      return [0, 1, 0];
    };

    await runBenchmark(model, benchmark, { embeddingProvider, embedFn });

    expect(providerCalled).toBe(true);
    expect(embedFnCalled).toBe(false);
  });
});

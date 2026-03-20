import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmbeddingProvider } from '../src/types.js';

// Mock @huggingface/transformers to avoid downloading 23MB model in CI
const mockPipeline = vi.fn();
vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
}));

// Import after mock setup
const { TransformersEmbeddingProvider, isTransformersAvailable } =
  await import('../src/providers/transformers-embedding.js');

describe('TransformersEmbeddingProvider', () => {
  let provider: InstanceType<typeof TransformersEmbeddingProvider>;
  const mockPipe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockPipe);
    provider = new TransformersEmbeddingProvider();
  });

  it('implements EmbeddingProvider interface', () => {
    const ep: EmbeddingProvider = provider;
    expect(ep.embed).toBeTypeOf('function');
    expect(ep.embedBatch).toBeTypeOf('function');
    expect(ep.getModelId).toBeTypeOf('function');
    expect(ep.getDimension).toBeTypeOf('function');
  });

  it('returns 384 dimensions by default', () => {
    expect(provider.getDimension()).toBe(384);
  });

  it('returns correct model ID', () => {
    expect(provider.getModelId()).toBe('transformers/all-MiniLM-L6-v2');
  });

  it('accepts custom model and dimension', () => {
    const custom = new TransformersEmbeddingProvider({
      model: 'Xenova/bge-small-en-v1.5',
      dimension: 384,
    });
    expect(custom.getModelId()).toBe('transformers/bge-small-en-v1.5');
    expect(custom.getDimension()).toBe(384);
  });

  it('embeds a single text', async () => {
    const fakeEmbedding = [[0.1, 0.2, 0.3]];
    mockPipe.mockResolvedValue({ tolist: () => fakeEmbedding });

    const result = await provider.embed('hello world');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockPipe).toHaveBeenCalledWith(
      ['hello world'],
      { pooling: 'mean', normalize: true },
    );
  });

  it('embeds a batch of texts', async () => {
    const fakeEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];
    mockPipe.mockResolvedValue({ tolist: () => fakeEmbeddings });

    const result = await provider.embedBatch(['hello', 'world']);
    expect(result).toEqual(fakeEmbeddings);
  });

  it('returns empty array for empty batch', async () => {
    const result = await provider.embedBatch([]);
    expect(result).toEqual([]);
    expect(mockPipe).not.toHaveBeenCalled();
  });

  it('throws on empty single embed result', async () => {
    mockPipe.mockResolvedValue({ tolist: () => [] });
    await expect(provider.embed('test')).rejects.toThrow(
      'Transformers embed returned empty result',
    );
  });

  it('caches the pipeline between calls', async () => {
    const fakeEmbedding = [[0.1, 0.2, 0.3]];
    mockPipe.mockResolvedValue({ tolist: () => fakeEmbedding });

    await provider.embed('first');
    await provider.embed('second');
    // Pipeline created once, reused
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('creates pipeline with correct args', async () => {
    const fakeEmbedding = [[0.1, 0.2, 0.3]];
    mockPipe.mockResolvedValue({ tolist: () => fakeEmbedding });

    await provider.embed('test');
    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { dtype: 'fp32' },
    );
  });
});

describe('isTransformersAvailable', () => {
  it('returns true when module is importable', async () => {
    const result = await isTransformersAvailable();
    expect(result).toBe(true);
  });
});

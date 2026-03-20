/**
 * Local embedding provider using @huggingface/transformers (ONNX).
 * Zero-config: no API key, no server, works offline after first model download.
 * @module providers/transformers-embedding
 */
import type { EmbeddingProvider } from '../types.js';

/** Configuration for the transformers embedding provider. */
export interface TransformersEmbeddingConfig {
  model?: string;
  dimension?: number;
}

/** Type for the feature-extraction pipeline function. */
type PipelineFn = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Embedding provider backed by @huggingface/transformers (ONNX runtime).
 * Uses all-MiniLM-L6-v2 by default (384 dims, ~23MB ONNX model).
 * Model is lazy-loaded on first embed() call and cached for reuse.
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string;
  private readonly dimension: number;
  private pipelinePromise: Promise<PipelineFn> | null = null;

  constructor(config?: TransformersEmbeddingConfig) {
    this.model = config?.model ?? 'Xenova/all-MiniLM-L6-v2';
    this.dimension = config?.dimension ?? 384;
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `transformers/${this.model.split('/').pop() ?? this.model}`;
  }

  /** Get the embedding dimension. */
  getDimension(): number {
    return this.dimension;
  }

  /** Embed a single text. */
  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    if (!result) {
      throw new Error('Transformers embed returned empty result');
    }
    return result;
  }

  /** Embed a batch of texts. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.getPipeline();
    const output = await pipe(texts, {
      pooling: 'mean',
      normalize: true,
    });
    return output.tolist();
  }

  /** Lazy-load and cache the feature-extraction pipeline. */
  private getPipeline(): Promise<PipelineFn> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  /** Load the transformers pipeline via dynamic import. */
  private async loadPipeline(): Promise<PipelineFn> {
    try {
      const mod = await import('@huggingface/transformers');
      const pipe = await mod.pipeline(
        'feature-extraction',
        this.model,
        { dtype: 'fp32' },
      );
      return pipe as unknown as PipelineFn;
    } catch (cause) {
      throw new Error(
        'Failed to load @huggingface/transformers. ' +
          'Install it with: pnpm add @huggingface/transformers',
        { cause },
      );
    }
  }
}

/**
 * Check whether @huggingface/transformers is importable.
 * Used by auto-detect to decide whether to offer this provider.
 */
export async function isTransformersAvailable(): Promise<boolean> {
  try {
    await import('@huggingface/transformers');
    return true;
  } catch {
    return false;
  }
}

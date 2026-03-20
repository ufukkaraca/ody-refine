/**
 * OpenAI embedding provider using native fetch — no vendor SDK.
 * @module providers/openai-embedding
 */
import type { EmbeddingProvider } from '../types.js';

/** Configuration for the OpenAI embedding provider. */
export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimension?: number;
}

/** Embedding provider backed by the OpenAI embeddings API. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimension: number;

  constructor(config: OpenAIEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.dimension = config.dimension ?? 1536;
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `openai/${this.model}`;
  }

  /** Get the embedding dimension. */
  getDimension(): number {
    return this.dimension;
  }

  /** Embed a single text. */
  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    if (!result) throw new Error('OpenAI embed returned empty result');
    return result;
  }

  /** Embed a batch of texts. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimension,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embed failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      data?: { embedding: number[]; index: number }[];
    };

    if (!json.data) return [];
    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

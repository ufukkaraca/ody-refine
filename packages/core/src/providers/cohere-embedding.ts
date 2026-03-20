/**
 * Cohere embedding provider using native fetch — no vendor SDK.
 * @module providers/cohere-embedding
 */
import type { EmbeddingProvider } from '../types.js';

/** Configuration for the Cohere embedding provider. */
export interface CohereEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimension?: number;
}

/** Embedding provider backed by the Cohere embeddings API. */
export class CohereEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimension: number;

  constructor(config: CohereEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'embed-english-v3.0';
    this.dimension = config.dimension ?? 1024;
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `cohere/${this.model}`;
  }

  /** Get the embedding dimension. */
  getDimension(): number {
    return this.dimension;
  }

  /** Embed a single text. */
  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    if (!result) throw new Error('Cohere embed returned empty result');
    return result;
  }

  /** Embed a batch of texts. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        texts,
        input_type: 'search_document',
        embedding_types: ['float'],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cohere embed failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      embeddings?: { float?: number[][] };
    };

    return json.embeddings?.float ?? [];
  }
}

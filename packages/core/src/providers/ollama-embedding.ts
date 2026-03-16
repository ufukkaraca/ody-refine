/**
 * Ollama embedding provider using native fetch — no vendor SDK.
 * @module providers/ollama-embedding
 */
import type { EmbeddingProvider } from '../types.js';

/** Configuration for the Ollama embedding provider. */
export interface OllamaEmbeddingConfig {
  baseUrl?: string;
  model?: string;
  dimension?: number;
}

/** Embedding provider backed by a local Ollama instance. */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimension: number;

  constructor(config?: OllamaEmbeddingConfig) {
    this.baseUrl = config?.baseUrl ?? 'http://localhost:11434';
    this.model = config?.model ?? 'nomic-embed-text';
    this.dimension = config?.dimension ?? 768;
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `ollama/${this.model}`;
  }

  /** Get the embedding dimension. */
  getDimension(): number {
    return this.dimension;
  }

  /** Embed a single text. */
  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    if (!result) throw new Error('Ollama embed returned empty result');
    return result;
  }

  /** Embed a batch of texts. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama embed failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { embeddings?: number[][] };
    return json.embeddings ?? [];
  }
}

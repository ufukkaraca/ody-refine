/**
 * Ollama LLM provider using native fetch — no vendor SDK.
 * @module providers/ollama-llm
 */
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** Configuration for the Ollama LLM provider. */
export interface OllamaLLMConfig {
  baseUrl?: string;
  model?: string;
}

/** LLM provider backed by a local Ollama instance. */
export class OllamaLLMProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config?: OllamaLLMConfig) {
    this.baseUrl = config?.baseUrl ?? 'http://localhost:11434';
    this.model = config?.model ?? 'llama3';
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `ollama/${this.model}`;
  }

  /** Complete a chat conversation. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const body = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? '';
  }

  /** Stream a chat conversation token by token. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const body = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat stream failed (${res.status}): ${text}`);
    }

    if (!res.body) {
      throw new Error('Ollama chat stream returned no body');
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          const token = chunk.message?.content;
          if (token) yield token;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

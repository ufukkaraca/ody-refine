/**
 * OpenRouter LLM provider — accesses free and paid models via OpenRouter API.
 * OpenAI-compatible API with model routing.
 * @module providers/openrouter-llm
 */
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** Configuration for the OpenRouter LLM provider. */
export interface OpenRouterLLMConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = 'meta-llama/llama-3.2-3b-instruct:free';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** LLM provider using OpenRouter's API (OpenAI-compatible). */
export class OpenRouterLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: OpenRouterLLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  /** Run a completion via OpenRouter API. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const body = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens ?? 200,
      temperature: options?.temperature ?? 0.1,
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `OpenRouter API error ${String(response.status)}: ${text}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null };
      }>;
    };

    return data.choices?.[0]?.message?.content ?? '';
  }

  /** Streaming via OpenRouter. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const result = await this.complete(messages, options);
    yield result;
  }

  getModelId(): string {
    return `openrouter/${this.model}`;
  }
}

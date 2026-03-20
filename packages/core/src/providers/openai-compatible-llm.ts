/**
 * OpenAI-compatible LLM provider — works with OpenAI, OpenRouter, Groq,
 * xAI Grok, and Google Gemini (all share the same chat completions format).
 * Zero vendor SDKs — raw fetch only.
 * @module providers/openai-compatible-llm
 */
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** Configuration for any OpenAI-compatible LLM provider. */
export interface OpenAICompatibleConfig {
  /** API key for authentication. */
  apiKey: string;
  /** Full URL to the chat completions endpoint. */
  baseUrl: string;
  /** Model identifier (e.g. 'gpt-4o-mini', 'llama-3.3-70b-versatile'). */
  model: string;
  /** Provider name used as prefix in getModelId() (e.g. 'openai', 'groq'). */
  providerName: string;
  /** Request timeout in milliseconds. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
}

/** Error class for unrecoverable API errors (auth, quota). */
export class LLMAuthError extends Error {
  constructor(provider: string, status: number, detail: string) {
    super(`${provider} authentication/quota error (${String(status)}): ${detail}`);
    this.name = 'LLMAuthError';
  }
}

/** Map HTTP status to a user-friendly hint. */
function describeHttpError(provider: string, status: number, body: string): Error {
  switch (status) {
    case 401:
      return new LLMAuthError(provider, status,
        `Invalid API key. Check your ${provider.toUpperCase()}_API_KEY.`);
    case 403:
      return new LLMAuthError(provider, status,
        `Access denied. Your API key may lack permissions. ${body}`);
    case 429:
      return new Error(
        `${provider} rate limit exceeded (429). Wait a moment and retry, or check your plan's quota.`);
    case 500:
    case 502:
    case 503:
      return new Error(
        `${provider} service error (${String(status)}). The API is temporarily unavailable — retry in a few seconds. ${body}`);
    default:
      return new Error(`${provider} API error (${String(status)}): ${body}`);
  }
}

/** Response shape from OpenAI-compatible chat completions. */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
}

/** SSE chunk shape from OpenAI-compatible streaming. */
interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
  }>;
}

/**
 * LLM provider for any service implementing the OpenAI chat completions API.
 * Handles: OpenAI, OpenRouter, Groq, xAI Grok, Google Gemini.
 */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly providerName: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.providerName = config.providerName;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  /** Get the model identifier (e.g. "openai/gpt-4o-mini"). */
  getModelId(): string {
    return `${this.providerName}/${this.model}`;
  }

  /** Complete a chat conversation. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      ...(options?.stopSequences?.length
        ? { stop: options.stopSequences }
        : {}),
    };

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw describeHttpError(this.providerName, res.status, text);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? '';
  }

  /** Stream a chat conversation token by token via SSE. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      stream: true,
      ...(options?.stopSequences?.length
        ? { stop: options.stopSequences }
        : {}),
    };

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw describeHttpError(this.providerName, res.status, text);
    }

    if (!res.body) {
      throw new Error(`${this.providerName} stream returned no body`);
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
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;
          const chunk = JSON.parse(payload) as StreamChunk;
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) yield token;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

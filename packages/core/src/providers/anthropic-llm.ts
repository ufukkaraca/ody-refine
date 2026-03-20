/**
 * Anthropic Claude LLM provider — uses the native Messages API.
 * Different auth and request/response format from OpenAI-compatible APIs.
 * Zero vendor SDKs — raw fetch only.
 * @module providers/anthropic-llm
 */
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** Configuration for the Anthropic LLM provider. */
export interface AnthropicLLMConfig {
  /** Anthropic API key. */
  apiKey: string;
  /** Model identifier (e.g. 'claude-haiku-4-5-20251001'). */
  model?: string;
  /** Request timeout in milliseconds. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Anthropic Messages API response shape. */
interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

/** SSE delta shape for Anthropic streaming. */
interface ContentBlockDelta {
  type: string;
  delta?: { type: string; text?: string };
}

/** LLM provider using Anthropic's native Messages API. */
export class AnthropicLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: AnthropicLLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `anthropic/${this.model}`;
  }

  /** Complete a chat conversation via Anthropic Messages API. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const { system, turns } = extractSystem(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: turns.map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body['system'] = system;
    if (options?.temperature !== undefined) {
      body['temperature'] = options.temperature;
    }
    if (options?.stopSequences?.length) {
      body['stop_sequences'] = options.stopSequences;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API error (${String(res.status)}): ${text}`);
    }

    const data = (await res.json()) as MessagesResponse;
    const textBlock = data.content?.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  /** Stream a chat conversation via Anthropic SSE. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const { system, turns } = extractSystem(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
      messages: turns.map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body['system'] = system;
    if (options?.temperature !== undefined) {
      body['temperature'] = options.temperature;
    }
    if (options?.stopSequences?.length) {
      body['stop_sequences'] = options.stopSequences;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Anthropic stream error (${String(res.status)}): ${text}`,
      );
    }

    if (!res.body) {
      throw new Error('Anthropic stream returned no body');
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
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          const event = JSON.parse(payload) as ContentBlockDelta;
          if (event.type === 'content_block_delta') {
            const token = event.delta?.text;
            if (token) yield token;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Extract system messages into a single string (Anthropic uses a top-level
 * system param, not a message role). Returns remaining user/assistant turns.
 */
function extractSystem(messages: ChatMessage[]): {
  system: string | undefined;
  turns: ChatMessage[];
} {
  const systemParts: string[] = [];
  const turns: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      turns.push(msg);
    }
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    turns,
  };
}

/**
 * Fallback LLM provider — tries providers in order, falls back on failure.
 * custom model -> base Ollama -> OpenRouter (or any configured chain).
 * @module providers/fallback-provider
 */
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** A log entry recorded when a provider handles (or fails) a request. */
export interface FallbackLog {
  modelId: string;
  success: boolean;
  durationMs: number;
  error?: string;
  timestamp: Date;
}

/** Configuration for the fallback provider. */
export interface FallbackProviderConfig {
  /** Ordered list of providers to try — first success wins. */
  providers: LLMProvider[];
  /** Optional logger callback (no console.log in library code). */
  logger?: (level: 'info' | 'warn' | 'error', msg: string) => void;
  /** Optional callback receiving every attempt log entry. */
  onAttempt?: (log: FallbackLog) => void;
}

/**
 * LLM provider that tries multiple providers in sequence.
 * Records which model actually answered each request.
 */
export class FallbackProvider implements LLMProvider {
  private readonly providers: LLMProvider[];
  private readonly log: (level: 'info' | 'warn' | 'error', msg: string) => void;
  private readonly onAttempt: ((log: FallbackLog) => void) | undefined;
  private readonly logs: FallbackLog[] = [];
  private lastUsedModelId = '';

  constructor(config: FallbackProviderConfig) {
    if (config.providers.length === 0) {
      throw new Error('FallbackProvider requires at least one provider');
    }
    this.providers = config.providers;
    this.log = config.logger ?? (() => {});
    this.onAttempt = config.onAttempt;
  }

  /** Get the model ID of the primary (first) provider. */
  getModelId(): string {
    return this.lastUsedModelId || this.providers[0]!.getModelId();
  }

  /** Get the model ID that actually answered the last request. */
  getLastUsedModelId(): string {
    return this.lastUsedModelId;
  }

  /** Get all attempt logs (useful for debugging and analytics). */
  getAttemptLogs(): readonly FallbackLog[] {
    return this.logs;
  }

  /** Complete a chat — tries providers in order until one succeeds. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      const modelId = provider.getModelId();
      const start = Date.now();

      try {
        const result = await provider.complete(messages, options);
        this.recordAttempt(modelId, true, Date.now() - start);
        this.lastUsedModelId = modelId;
        return result;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.recordAttempt(modelId, false, Date.now() - start, errMsg);
        errors.push(`${modelId}: ${errMsg}`);
        this.log('warn', `Provider ${modelId} failed, trying next: ${errMsg}`);
      }
    }

    throw new Error(
      `All providers failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  /** Stream a chat — tries providers in order until one succeeds. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      const modelId = provider.getModelId();
      const start = Date.now();

      try {
        const gen = provider.stream(messages, options);
        const firstChunk = await gen.next();
        this.recordAttempt(modelId, true, Date.now() - start);
        this.lastUsedModelId = modelId;

        if (!firstChunk.done) {
          yield firstChunk.value;
          yield* gen;
        }
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.recordAttempt(modelId, false, Date.now() - start, errMsg);
        errors.push(`${modelId}: ${errMsg}`);
        this.log('warn', `Provider ${modelId} stream failed: ${errMsg}`);
      }
    }

    throw new Error(
      `All providers failed (stream):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  private recordAttempt(
    modelId: string,
    success: boolean,
    durationMs: number,
    error?: string,
  ): void {
    const entry: FallbackLog = {
      modelId,
      success,
      durationMs,
      error,
      timestamp: new Date(),
    };
    this.logs.push(entry);
    this.onAttempt?.(entry);
  }
}

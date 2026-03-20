/**
 * Provider presets and factory for all supported LLM providers.
 * Maps provider names to their endpoint URLs, default models, and env var keys.
 * @module providers/provider-presets
 */
import type { LLMProvider } from '../types.js';
import { OpenAICompatibleLLMProvider } from './openai-compatible-llm.js';
import { AnthropicLLMProvider } from './anthropic-llm.js';
import { OllamaLLMProvider } from './ollama-llm.js';

/** Preset configuration for an OpenAI-compatible provider. */
export interface ProviderPreset {
  baseUrl: string;
  defaultModel: string;
  envKey: string;
}

/** All supported provider names. */
export type ProviderName =
  | 'openai' | 'openrouter' | 'groq' | 'xai' | 'gemini'
  | 'anthropic' | 'ollama';

/** Presets for OpenAI-compatible providers. */
export const OPENAI_COMPATIBLE_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'google/gemini-2.0-flash-lite-001',
    envKey: 'OPENROUTER_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-4.1-fast-non-reasoning',
    envKey: 'XAI_API_KEY',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
    envKey: 'GEMINI_API_KEY',
  },
};

/** Anthropic preset (separate due to different API format). */
export const ANTHROPIC_PRESET: ProviderPreset = {
  baseUrl: 'https://api.anthropic.com/v1/messages',
  defaultModel: 'claude-haiku-4-5-20251001',
  envKey: 'ANTHROPIC_API_KEY',
};

/**
 * Create an LLM provider by name. Resolves API key from the given value
 * or falls back to the preset's env var.
 */
export function createLlmProvider(
  name: ProviderName,
  options?: { apiKey?: string; model?: string; baseUrl?: string },
): LLMProvider {
  if (name === 'ollama') {
    return new OllamaLLMProvider({
      baseUrl: options?.baseUrl ?? 'http://localhost:11434',
      model: options?.model ?? 'llama3',
    });
  }

  if (name === 'anthropic') {
    const key = options?.apiKey ?? process.env[ANTHROPIC_PRESET.envKey] ?? '';
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    return new AnthropicLLMProvider({
      apiKey: key,
      model: options?.model ?? ANTHROPIC_PRESET.defaultModel,
    });
  }

  const preset = OPENAI_COMPATIBLE_PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown provider: ${name}`);
  }

  const key = options?.apiKey ?? process.env[preset.envKey] ?? '';
  if (!key) throw new Error(`${preset.envKey} not set`);

  return new OpenAICompatibleLLMProvider({
    apiKey: key,
    baseUrl: options?.baseUrl ?? preset.baseUrl,
    model: options?.model ?? preset.defaultModel,
    providerName: name,
  });
}

/** All known provider names in auto-detection priority order. */
export const PROVIDER_DETECTION_ORDER: ProviderName[] = [
  'anthropic', 'openai', 'groq', 'gemini', 'xai', 'openrouter',
];

/**
 * Tests that `resolve --auto` uses the detectLlmProvider cascade
 * (respects OPENROUTER_API_KEY and other env vars) instead of
 * hardcoding Ollama.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMProvider } from '@useody/platform-core';
import { DEFAULT_CONFIG } from '../src/config/schema.js';
import type { RefineConfig } from '../src/config/schema.js';

// ── Fake LLM provider returned by createLlmProvider ─────────────────
class FakeLlmProvider implements LLMProvider {
  constructor(public providerName: string) {}
  complete = vi.fn().mockResolvedValue('{}');
  stream = vi.fn();
  getModelId = vi.fn().mockReturnValue('test-model');
}

const mockCreateLlmProvider = vi.fn(
  (name: string) => new FakeLlmProvider(name),
);

vi.mock('@useody/platform-core', () => ({
  createLlmProvider: (...args: unknown[]) =>
    mockCreateLlmProvider(...(args as [string])),
  PROVIDER_DETECTION_ORDER: [
    'anthropic', 'openai', 'groq', 'gemini', 'xai', 'openrouter',
  ],
  OPENAI_COMPATIBLE_PRESETS: {
    openai: { envKey: 'OPENAI_API_KEY' },
    groq: { envKey: 'GROQ_API_KEY' },
    gemini: { envKey: 'GEMINI_API_KEY' },
    xai: { envKey: 'XAI_API_KEY' },
    openrouter: { envKey: 'OPENROUTER_API_KEY' },
  },
  ANTHROPIC_PRESET: { envKey: 'ANTHROPIC_API_KEY' },
}));

// Import after mock so auto-detect resolves the mocked module.
const { detectLlmProvider } = await import('../src/config/auto-detect.js');

function cfg(overrides?: Partial<RefineConfig>): RefineConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe('resolve --auto respects LLM provider cascade', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'GROQ_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('uses OpenRouter when OPENROUTER_API_KEY is set', async () => {
    process.env['OPENROUTER_API_KEY'] = 'or-test-key-123';

    const llm = await detectLlmProvider(cfg());

    expect(llm).toBeDefined();
    expect(mockCreateLlmProvider).toHaveBeenCalledWith(
      'openrouter',
      expect.objectContaining({ apiKey: 'or-test-key-123' }),
    );
  });

  it('prefers Anthropic over OpenRouter when both are set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'ant-key';
    process.env['OPENROUTER_API_KEY'] = 'or-key';

    const llm = await detectLlmProvider(cfg());

    expect(llm).toBeDefined();
    expect(mockCreateLlmProvider).toHaveBeenCalledWith(
      'anthropic',
      expect.objectContaining({ apiKey: 'ant-key' }),
    );
  });

  it('returns undefined when no API key and no Ollama', async () => {
    // No env vars set, no Ollama running (fetch will fail)
    const llm = await detectLlmProvider(cfg());
    expect(llm).toBeUndefined();
  });
});

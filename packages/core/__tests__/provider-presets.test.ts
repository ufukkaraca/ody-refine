import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createLlmProvider,
  OPENAI_COMPATIBLE_PRESETS,
  ANTHROPIC_PRESET,
  PROVIDER_DETECTION_ORDER,
} from '../src/providers/provider-presets.js';
import type { ProviderName } from '../src/providers/provider-presets.js';

describe('OPENAI_COMPATIBLE_PRESETS', () => {
  it('has entries for openai, openrouter, groq, xai, gemini', () => {
    expect(OPENAI_COMPATIBLE_PRESETS['openai']).toBeDefined();
    expect(OPENAI_COMPATIBLE_PRESETS['openrouter']).toBeDefined();
    expect(OPENAI_COMPATIBLE_PRESETS['groq']).toBeDefined();
    expect(OPENAI_COMPATIBLE_PRESETS['xai']).toBeDefined();
    expect(OPENAI_COMPATIBLE_PRESETS['gemini']).toBeDefined();
  });

  it('each preset has required fields', () => {
    for (const [_name, preset] of Object.entries(OPENAI_COMPATIBLE_PRESETS)) {
      expect(preset.baseUrl).toBeTruthy();
      expect(preset.baseUrl).toContain('http');
      expect(preset.defaultModel).toBeTruthy();
      expect(preset.envKey).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('ANTHROPIC_PRESET', () => {
  it('has correct structure', () => {
    expect(ANTHROPIC_PRESET.baseUrl).toContain('anthropic.com');
    expect(ANTHROPIC_PRESET.defaultModel).toContain('claude');
    expect(ANTHROPIC_PRESET.envKey).toBe('ANTHROPIC_API_KEY');
  });
});

describe('PROVIDER_DETECTION_ORDER', () => {
  it('has anthropic first (most common enterprise provider)', () => {
    expect(PROVIDER_DETECTION_ORDER[0]).toBe('anthropic');
  });

  it('includes all non-ollama providers', () => {
    expect(PROVIDER_DETECTION_ORDER).toContain('anthropic');
    expect(PROVIDER_DETECTION_ORDER).toContain('openai');
    expect(PROVIDER_DETECTION_ORDER).toContain('groq');
    expect(PROVIDER_DETECTION_ORDER).toContain('gemini');
    expect(PROVIDER_DETECTION_ORDER).toContain('xai');
    expect(PROVIDER_DETECTION_ORDER).toContain('openrouter');
  });

  it('does not include ollama (local, no env key to detect)', () => {
    expect(PROVIDER_DETECTION_ORDER).not.toContain('ollama');
  });
});

describe('createLlmProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates ollama provider without API key', () => {
    const provider = createLlmProvider('ollama');
    expect(provider.getModelId()).toContain('llama');
  });

  it('creates ollama provider with custom model', () => {
    const provider = createLlmProvider('ollama', { model: 'mistral:7b' });
    expect(provider.getModelId()).toContain('mistral:7b');
  });

  it('creates ollama provider with custom base URL', () => {
    const provider = createLlmProvider('ollama', {
      baseUrl: 'http://remote:11434',
    });
    // Provider should be created without error
    expect(provider.getModelId()).toBeTruthy();
  });

  it('throws when anthropic key is missing', () => {
    const saved = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      expect(() => createLlmProvider('anthropic')).toThrow('ANTHROPIC_API_KEY');
    } finally {
      if (saved) process.env['ANTHROPIC_API_KEY'] = saved;
    }
  });

  it('creates anthropic provider with explicit API key', () => {
    const provider = createLlmProvider('anthropic', {
      apiKey: 'sk-ant-test-key',
    });
    expect(provider.getModelId()).toContain('claude');
  });

  it('creates anthropic provider with custom model', () => {
    const provider = createLlmProvider('anthropic', {
      apiKey: 'sk-ant-test-key',
      model: 'claude-sonnet-4-20250514',
    });
    expect(provider.getModelId()).toContain('claude-sonnet-4-20250514');
  });

  it('throws for openai when env key is missing', () => {
    const saved = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      expect(() => createLlmProvider('openai')).toThrow('OPENAI_API_KEY');
    } finally {
      if (saved) process.env['OPENAI_API_KEY'] = saved;
    }
  });

  it('creates openai provider with explicit API key', () => {
    const provider = createLlmProvider('openai', {
      apiKey: 'sk-test-key-12345',
    });
    expect(provider.getModelId()).toBeTruthy();
  });

  it('creates groq provider with explicit API key', () => {
    const provider = createLlmProvider('groq', {
      apiKey: 'gsk-test-key',
    });
    expect(provider.getModelId()).toBeTruthy();
  });

  it('throws for unknown provider name', () => {
    expect(() =>
      createLlmProvider('nonexistent' as ProviderName),
    ).toThrow('Unknown provider');
  });

  it('uses env var as fallback for OpenAI-compatible providers', () => {
    const saved = process.env['GROQ_API_KEY'];
    process.env['GROQ_API_KEY'] = 'gsk-env-key';
    try {
      const provider = createLlmProvider('groq');
      expect(provider.getModelId()).toBeTruthy();
    } finally {
      if (saved) {
        process.env['GROQ_API_KEY'] = saved;
      } else {
        delete process.env['GROQ_API_KEY'];
      }
    }
  });

  it('allows custom baseUrl override for openai-compatible providers', () => {
    const provider = createLlmProvider('openai', {
      apiKey: 'sk-test',
      baseUrl: 'http://localhost:8080/v1/chat/completions',
    });
    expect(provider.getModelId()).toBeTruthy();
  });
});

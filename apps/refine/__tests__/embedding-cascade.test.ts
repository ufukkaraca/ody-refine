import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RefineConfig } from '../src/config/schema.js';
import { DEFAULT_CONFIG } from '../src/config/schema.js';

// ── Fake provider classes for assertions ────────────────────────────
class FakeOllamaEmbedding {
  constructor(public opts: { baseUrl: string; model: string }) {}
}
class FakeTransformersEmbedding {}
class FakeCohereEmbedding {
  constructor(public opts: { apiKey: string; model: string }) {}
}
class FakeOpenAIEmbedding {
  constructor(public opts: { apiKey: string; model: string }) {}
}

// ── Mocks ───────────────────────────────────────────────────────────
const mockIsTransformersAvailable = vi.fn<() => Promise<boolean>>();

vi.mock('@useody/platform-core', () => ({
  OllamaEmbeddingProvider: FakeOllamaEmbedding,
  TransformersEmbeddingProvider: FakeTransformersEmbedding,
  CohereEmbeddingProvider: FakeCohereEmbedding,
  OpenAIEmbeddingProvider: FakeOpenAIEmbedding,
  isTransformersAvailable: (...args: unknown[]) =>
    mockIsTransformersAvailable(...(args as [])),
}));

// Import after mock so the dynamic import('@useody/platform-core') resolves
// to the mocked module.
const { detectEmbeddingProvider, detectOllama, TRANSFORMERS_TIMEOUT_MS } =
  await import('../src/config/auto-detect.js');

/** Build a minimal RefineConfig with optional overrides. */
function cfg(overrides?: Partial<RefineConfig>): RefineConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('detectEmbeddingProvider cascade', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // Snapshot env vars we might touch
    for (const key of ['COHERE_API_KEY', 'OPENAI_API_KEY']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  // ── 1. Ollama first ─────────────────────────────────────────────
  it('picks Ollama when it is running with an embedding model', async () => {
    // Simulate a local Ollama with nomic-embed-text available
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'nomic-embed-text' }, { name: 'llama3:8b' }],
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const provider = await detectEmbeddingProvider(cfg());
    expect(provider).toBeInstanceOf(FakeOllamaEmbedding);
    const p = provider as unknown as FakeOllamaEmbedding;
    expect(p.opts.model).toBe('nomic-embed-text');
    // TransformersJS should NOT have been checked
    expect(mockIsTransformersAvailable).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // ── 2. TransformersJS fallback ──────────────────────────────────
  it('falls back to TransformersJS when Ollama is not running', async () => {
    // Ollama unreachable
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);
    mockIsTransformersAvailable.mockResolvedValue(true);

    const provider = await detectEmbeddingProvider(cfg());
    expect(provider).toBeInstanceOf(FakeTransformersEmbedding);

    vi.unstubAllGlobals();
  });

  // ── 3. TransformersJS timeout → API key fallback ────────────────
  it('falls through to Cohere if TransformersJS times out', async () => {
    // Ollama unreachable
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);

    // TransformersJS hangs forever (never resolves)
    mockIsTransformersAvailable.mockReturnValue(new Promise(() => {}));
    process.env['COHERE_API_KEY'] = 'test-cohere-key';

    // Override the timeout to 50ms so the test is fast
    // We cannot override the constant directly, so we use vi.useFakeTimers
    vi.useFakeTimers();

    const resultPromise = detectEmbeddingProvider(cfg());

    // Advance past the 15s timeout
    await vi.advanceTimersByTimeAsync(TRANSFORMERS_TIMEOUT_MS + 100);

    const provider = await resultPromise;
    expect(provider).toBeInstanceOf(FakeCohereEmbedding);
    const p = provider as unknown as FakeCohereEmbedding;
    expect(p.opts.apiKey).toBe('test-cohere-key');

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── 4. TransformersJS error → API key fallback ──────────────────
  it('falls through to Cohere if TransformersJS throws', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);

    mockIsTransformersAvailable.mockRejectedValue(
      new Error('Cannot find module @huggingface/transformers'),
    );
    process.env['COHERE_API_KEY'] = 'test-cohere-key';

    const provider = await detectEmbeddingProvider(cfg());
    expect(provider).toBeInstanceOf(FakeCohereEmbedding);

    vi.unstubAllGlobals();
  });

  // ── 5. OpenAI as last resort ────────────────────────────────────
  it('uses OpenAI when configured and other providers unavailable', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);
    mockIsTransformersAvailable.mockResolvedValue(false);
    process.env['OPENAI_API_KEY'] = 'sk-test-openai';

    const config = cfg({
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: '',
      },
    });

    const provider = await detectEmbeddingProvider(config);
    expect(provider).toBeInstanceOf(FakeOpenAIEmbedding);
    const p = provider as unknown as FakeOpenAIEmbedding;
    expect(p.opts.model).toBe('text-embedding-3-small');

    vi.unstubAllGlobals();
  });

  // ── 6. Returns null when nothing is available ───────────────────
  it('returns null when no provider is available', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);
    mockIsTransformersAvailable.mockResolvedValue(false);

    const provider = await detectEmbeddingProvider(cfg());
    expect(provider).toBeNull();

    vi.unstubAllGlobals();
  });

  // ── 7. Log callback receives messages ───────────────────────────
  it('calls the log callback with cascade progress', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);
    mockIsTransformersAvailable.mockResolvedValue(true);

    const logs: string[] = [];
    await detectEmbeddingProvider(cfg(), (msg) => logs.push(msg));

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((m) => m.includes('Ollama'))).toBe(true);
    expect(logs.some((m) => m.includes('TransformersJS'))).toBe(true);

    vi.unstubAllGlobals();
  });

  // ── 8. Ollama preferred model ordering ──────────────────────────
  it('prefers nomic-embed-text over other Ollama embedding models', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'mxbai-embed-large' },
          { name: 'nomic-embed-text:latest' },
          { name: 'llama3:8b' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const provider = await detectEmbeddingProvider(cfg());
    expect(provider).toBeInstanceOf(FakeOllamaEmbedding);
    const p = provider as unknown as FakeOllamaEmbedding;
    expect(p.opts.model).toBe('nomic-embed-text:latest');

    vi.unstubAllGlobals();
  });
});

describe('detectOllama', () => {
  it('returns available:true with model list on success', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:8b' }, { name: 'nomic-embed-text' }],
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await detectOllama('http://localhost:11434');
    expect(result.available).toBe(true);
    expect(result.models).toContain('nomic-embed-text');

    vi.unstubAllGlobals();
  });

  it('returns available:false on network error', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fakeFetch);

    const result = await detectOllama('http://localhost:11434');
    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('returns available:false on non-ok response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await detectOllama('http://localhost:11434');
    expect(result.available).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('TRANSFORMERS_TIMEOUT_MS', () => {
  it('is 15 seconds', () => {
    expect(TRANSFORMERS_TIMEOUT_MS).toBe(15_000);
  });
});

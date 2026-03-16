import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config/loader.js';
import { DEFAULT_CONFIG } from '../src/config/schema.js';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ody-refine-config-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env['ODY_EMBEDDING_PROVIDER'];
    delete process.env['ODY_EMBEDDING_MODEL'];
    delete process.env['ODY_EMBEDDING_API_KEY'];
    delete process.env['ODY_LLM_PROVIDER'];
    delete process.env['ODY_LLM_MODEL'];
    delete process.env['ODY_LLM_API_KEY'];
    delete process.env['ODY_OLLAMA_BASE_URL'];
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(join(tempDir, 'nonexistent.toml'));
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('merges TOML config over defaults', () => {
    const tomlPath = join(tempDir, 'config.toml');
    writeFileSync(tomlPath, `
[embedding]
provider = "openai"
model = "text-embedding-3-small"
apiKey = "sk-test"

[llm]
provider = "anthropic"
model = "claude-3"
`);

    const config = loadConfig(tomlPath);
    expect(config.embedding.provider).toBe('openai');
    expect(config.embedding.model).toBe('text-embedding-3-small');
    expect(config.embedding.apiKey).toBe('sk-test');
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.model).toBe('claude-3');
    // Defaults preserved for unset values
    expect(config.ollama.baseUrl).toBe(DEFAULT_CONFIG.ollama.baseUrl);
    expect(config.database.type).toBe('sqlite');
  });

  it('overlays environment variables over TOML', () => {
    const tomlPath = join(tempDir, 'config.toml');
    writeFileSync(tomlPath, `
[embedding]
provider = "openai"
model = "text-embedding-3-small"
`);

    process.env['ODY_EMBEDDING_PROVIDER'] = 'cohere';
    process.env['ODY_EMBEDDING_MODEL'] = 'embed-english-v3.0';

    const config = loadConfig(tomlPath);
    expect(config.embedding.provider).toBe('cohere');
    expect(config.embedding.model).toBe('embed-english-v3.0');
  });

  it('handles malformed TOML gracefully', () => {
    const tomlPath = join(tempDir, 'bad.toml');
    writeFileSync(tomlPath, '{{{{ invalid toml');

    const config = loadConfig(tomlPath);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('validates provider values', () => {
    const tomlPath = join(tempDir, 'config.toml');
    writeFileSync(tomlPath, `
[embedding]
provider = "invalid_provider"
`);

    const config = loadConfig(tomlPath);
    expect(config.embedding.provider).toBe(DEFAULT_CONFIG.embedding.provider);
  });

  it('reads ODY_OLLAMA_BASE_URL from env', () => {
    process.env['ODY_OLLAMA_BASE_URL'] = 'http://remote:11434';
    const config = loadConfig(join(tempDir, 'nonexistent.toml'));
    expect(config.ollama.baseUrl).toBe('http://remote:11434');
  });

  it('reads LLM env vars', () => {
    process.env['ODY_LLM_PROVIDER'] = 'openai';
    process.env['ODY_LLM_MODEL'] = 'gpt-4';
    process.env['ODY_LLM_API_KEY'] = 'sk-llm-test';

    const config = loadConfig(join(tempDir, 'nonexistent.toml'));
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('gpt-4');
    expect(config.llm.apiKey).toBe('sk-llm-test');
  });
});

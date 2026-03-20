/**
 * Configuration loader — reads TOML config file, overlays env vars, returns merged config.
 * @module config/loader
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_CONFIG } from './schema.js';
import type { RefineConfig } from './schema.js';

/** Path to the global TOML config file. */
function getConfigPath(): string {
  return join(homedir(), '.config', 'ody-refine', 'config.toml');
}

/**
 * Minimal TOML parser for flat section/key-value configs.
 * Handles [section] headers and key = "value" / key = value pairs.
 */
function parseSimpleToml(raw: string): Record<string, Record<string, string> | string> {
  const result: Record<string, Record<string, string> | string> = {};
  let currentSection = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!;
      if (!(currentSection in result)) {
        result[currentSection] = {};
      }
      continue;
    }

    const kvMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/.exec(trimmed);
    if (kvMatch) {
      const key = kvMatch[1]!;
      let value = kvMatch[2]!.trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (currentSection) {
        const section = result[currentSection];
        if (section && typeof section === 'object') {
          section[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/** Read and parse a TOML config file, returning a partial config object. */
function readTomlConfig(filePath: string): Partial<TomlShape> {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, 'utf-8');
  try {
    const parsed = parseSimpleToml(raw);
    const result: Partial<TomlShape> = {};

    const embedding = parsed['embedding'];
    if (embedding && typeof embedding === 'object') {
      result.embedding = {
        provider: embedding['provider'],
        model: embedding['model'],
        apiKey: embedding['apiKey'],
      };
    }

    const llm = parsed['llm'];
    if (llm && typeof llm === 'object') {
      result.llm = {
        provider: llm['provider'],
        model: llm['model'],
        apiKey: llm['apiKey'],
      };
    }

    const ollama = parsed['ollama'];
    if (ollama && typeof ollama === 'object') {
      result.ollama = { baseUrl: ollama['baseUrl'] };
    }

    const dataDir = parsed['dataDir'];
    if (typeof dataDir === 'string') {
      result.dataDir = dataDir;
    }

    return result;
  } catch {
    return {};
  }
}

interface TomlShape {
  embedding?: { provider?: string; model?: string; apiKey?: string };
  llm?: { provider?: string; model?: string; apiKey?: string };
  ollama?: { baseUrl?: string };
  database?: { type?: string };
  dataDir?: string;
}

/** Read environment variable overrides. */
function readEnvOverrides(): Partial<TomlShape> {
  const result: Partial<TomlShape> = {};
  const env = process.env;

  if (env['ODY_EMBEDDING_PROVIDER'] || env['ODY_EMBEDDING_MODEL'] || env['ODY_EMBEDDING_API_KEY']) {
    result.embedding = {
      ...(env['ODY_EMBEDDING_PROVIDER'] ? { provider: env['ODY_EMBEDDING_PROVIDER'] } : {}),
      ...(env['ODY_EMBEDDING_MODEL'] ? { model: env['ODY_EMBEDDING_MODEL'] } : {}),
      ...(env['ODY_EMBEDDING_API_KEY'] ? { apiKey: env['ODY_EMBEDDING_API_KEY'] } : {}),
    };
  }

  if (env['ODY_LLM_PROVIDER'] || env['ODY_LLM_MODEL'] || env['ODY_LLM_API_KEY']) {
    result.llm = {
      ...(env['ODY_LLM_PROVIDER'] ? { provider: env['ODY_LLM_PROVIDER'] } : {}),
      ...(env['ODY_LLM_MODEL'] ? { model: env['ODY_LLM_MODEL'] } : {}),
      ...(env['ODY_LLM_API_KEY'] ? { apiKey: env['ODY_LLM_API_KEY'] } : {}),
    };
  }

  if (env['ODY_OLLAMA_BASE_URL']) {
    result.ollama = { baseUrl: env['ODY_OLLAMA_BASE_URL'] };
  }

  return result;
}

/** Merge a partial TOML shape into the base config. */
function mergeInto(base: RefineConfig, partial: Partial<TomlShape>): RefineConfig {
  return {
    embedding: {
      provider: validEmbeddingProvider(partial.embedding?.provider) ?? base.embedding.provider,
      model: partial.embedding?.model ?? base.embedding.model,
      apiKey: partial.embedding?.apiKey ?? base.embedding.apiKey,
    },
    llm: {
      provider: validLlmProvider(partial.llm?.provider) ?? base.llm.provider,
      model: partial.llm?.model ?? base.llm.model,
      apiKey: partial.llm?.apiKey ?? base.llm.apiKey,
    },
    ollama: {
      baseUrl: partial.ollama?.baseUrl ?? base.ollama.baseUrl,
    },
    database: { type: 'sqlite' },
    dataDir: partial.dataDir ?? base.dataDir,
  };
}

function validEmbeddingProvider(v: string | undefined): 'ollama' | 'openai' | 'cohere' | undefined {
  if (v === 'ollama' || v === 'openai' || v === 'cohere') return v;
  return undefined;
}

function validLlmProvider(v: string | undefined): 'ollama' | 'openai' | 'anthropic' | undefined {
  if (v === 'ollama' || v === 'openai' || v === 'anthropic') return v;
  return undefined;
}

/**
 * Load the Refine CLI configuration.
 * Precedence: defaults < TOML file < environment variables.
 */
export function loadConfig(configPath?: string): RefineConfig {
  const tomlPath = configPath ?? getConfigPath();
  const toml = readTomlConfig(tomlPath);
  const envOverrides = readEnvOverrides();

  let config = { ...DEFAULT_CONFIG };
  config = mergeInto(config, toml);
  config = mergeInto(config, envOverrides);

  return config;
}

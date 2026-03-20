/**
 * Integration test: run the five detectors against real public documentation.
 * Gated behind RUN_INTEGRATION=1 so CI skips it by default.
 *
 * Doc sets:
 *   1. FastAPI (Python web framework) — 5 files
 *   2. Express.js (Node web framework) — 5 files
 *
 * @module real-doc-validation
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDetection } from '../src/run-detection.js';
import type { RunDetectionOutput } from '../src/run-detection.js';
import type {
  KnowledgeNode,
  Detection,
  LLMProvider,
} from '@useody/platform-core';
import { OpenAICompatibleLLMProvider } from '@useody/platform-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', '..', 'eval', 'fixtures', 'real-docs');

const SKIP = process.env['RUN_INTEGRATION'] !== '1';
const describeMaybe = SKIP ? describe.skip : describe;

// ── helpers ──────────────────────────────────────────────────────────

/** Hash-bucket bag-of-words embedding (128-d). Gives meaningful cosine similarity. */
function simpleEmbedding(text: string, dim = 128): number[] {
  const vec = new Float64Array(dim);
  const tokens = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/);
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = ((h << 5) - h + tok.charCodeAt(i)) | 0;
    const bucket = ((h % dim) + dim) % dim;
    vec[bucket] += 1;
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag > 0) for (let i = 0; i < dim; i++) vec[i] /= mag;
  return Array.from(vec);
}

/** Load all .md files in a directory and convert to KnowledgeNode[]. */
function loadDocSet(dir: string, prefix: string): KnowledgeNode[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const title = raw.match(/^#\s+(.+)/m)?.[1] ?? basename(file, '.md');
    const summary = raw.slice(0, 500);
    return {
      id: `${prefix}-${basename(file, '.md')}`,
      title,
      content: {
        summary,
        raw,
        source: { sourceType: 'markdown', sourceId: file },
      },
      embedding: simpleEmbedding(raw),
      embeddingModel: 'bag-of-words-128',
      embeddingDim: 128,
      confidence: 1,
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    } satisfies KnowledgeNode;
  });
}

/** Create an OpenRouter LLM provider from env. */
function makeLLM(): LLMProvider | undefined {
  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) return undefined;
  const model = process.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-3-haiku';
  return new OpenAICompatibleLLMProvider({
    apiKey: key,
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model,
    providerName: 'openrouter',
    timeoutMs: 30_000,
  });
}

/** Pretty-print a detection report to console. */
function printReport(label: string, output: RunDetectionOutput): void {
  console.log(`\n═══ ${label} ═══`);
  console.log(`Total findings: ${String(output.detections.length)}`);
  for (const s of output.stats) {
    console.log(`  ${s.name}: ${String(s.detectionCount)} findings (${String(s.durationMs)}ms)`);
  }
  if (output.detections.length > 0) {
    console.log('\nFindings:');
    for (const d of output.detections) {
      const desc = d.description.slice(0, 120);
      console.log(`  [${d.severity.toUpperCase()}] ${d.type}: ${desc}`);
    }
  }
}

/** Validate that every detection satisfies the Detection interface. */
function assertValidDetections(detections: Detection[]): void {
  const validTypes = new Set([
    'contradiction', 'duplicate', 'staleness', 'undocumented', 'time_bomb',
  ]);
  const validSeverities = new Set(['critical', 'warning', 'info']);
  for (const d of detections) {
    expect(validTypes.has(d.type)).toBe(true);
    expect(validSeverities.has(d.severity)).toBe(true);
    expect(Array.isArray(d.nodeIds)).toBe(true);
    expect(typeof d.description).toBe('string');
    expect(d.description.length).toBeGreaterThan(0);
  }
}

// ── tests ────────────────────────────────────────────────────────────

describeMaybe('real-doc validation (integration)', () => {
  const fastApiNodes = loadDocSet(join(FIXTURES, 'fastapi'), 'fastapi');
  const expressNodes = loadDocSet(join(FIXTURES, 'expressjs'), 'expressjs');
  const llm = makeLLM();

  it('loads FastAPI doc set (5 files)', () => {
    expect(fastApiNodes).toHaveLength(5);
    for (const n of fastApiNodes) {
      expect(n.content.raw!.length).toBeGreaterThan(100);
      expect(n.embedding.length).toBe(128);
    }
  });

  it('loads Express.js doc set (5 files)', () => {
    expect(expressNodes).toHaveLength(5);
    for (const n of expressNodes) {
      expect(n.content.raw!.length).toBeGreaterThan(100);
      expect(n.embedding.length).toBe(128);
    }
  });

  it('runs detectors on FastAPI docs and produces valid findings', async () => {
    const output = await runDetection({ nodes: fastApiNodes, edges: [], llm });
    printReport('FastAPI docs', output);
    assertValidDetections(output.detections);
    expect(output.detections.length).toBeGreaterThanOrEqual(1);
    expect(output.stats.length).toBe(5);
  }, 120_000);

  it('runs detectors on Express.js docs and produces valid findings', async () => {
    const output = await runDetection({ nodes: expressNodes, edges: [], llm });
    printReport('Express.js docs', output);
    assertValidDetections(output.detections);
    expect(output.detections.length).toBeGreaterThanOrEqual(1);
    expect(output.stats.length).toBe(5);
  }, 120_000);

  it('runs detectors on combined corpus', async () => {
    const allNodes = [...fastApiNodes, ...expressNodes];
    const output = await runDetection({ nodes: allNodes, edges: [], llm });
    printReport('Combined corpus (FastAPI + Express)', output);
    assertValidDetections(output.detections);
    expect(output.detections.length).toBeGreaterThanOrEqual(1);
  }, 180_000);
});

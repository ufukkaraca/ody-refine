/**
 * End-to-end detection pipeline test.
 * Loads real fixture documents, creates KnowledgeNodes, runs all detectors,
 * and verifies detection output structure and pipeline integrity.
 * @module detection-e2e
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDetection } from '../src/run-detection.js';
import type { KnowledgeNode, Detection, LLMProvider } from '@useody/platform-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', '..', 'eval', 'fixtures', 'real-docs');

// ── helpers ──────────────────────────────────────────────────────────

/** Hash-bucket bag-of-words embedding (128-d) for meaningful cosine similarity. */
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
    return {
      id: `${prefix}-${basename(file, '.md')}`,
      title,
      content: {
        summary: raw.slice(0, 500),
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

/** Create a mock LLM that returns canned JSON responses. */
function makeMockLlm(): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(JSON.stringify({
      isContradiction: false,
      splitTruth: false,
      hasTimeBomb: false,
      claims: [],
    })),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('mock-model'),
  };
}

const VALID_TYPES = new Set(['contradiction', 'duplicate', 'staleness', 'undocumented', 'time_bomb']);
const VALID_SEVERITIES = new Set(['critical', 'warning', 'info']);

/** Validate structural correctness of a detection array. */
function assertValidDetections(detections: Detection[]): void {
  for (const d of detections) {
    expect(VALID_TYPES.has(d.type)).toBe(true);
    expect(VALID_SEVERITIES.has(d.severity)).toBe(true);
    expect(Array.isArray(d.nodeIds)).toBe(true);
    expect(d.nodeIds.length).toBeGreaterThan(0);
    expect(typeof d.description).toBe('string');
    expect(d.description.length).toBeGreaterThan(0);
  }
}

// ── tests ────────────────────────────────────────────────────────────

describe('detection pipeline e2e', () => {
  const fastApiNodes = loadDocSet(join(FIXTURES, 'fastapi'), 'fastapi');
  const expressNodes = loadDocSet(join(FIXTURES, 'expressjs'), 'expressjs');
  const allNodes = [...fastApiNodes, ...expressNodes];
  const mockLlm = makeMockLlm();

  describe('fixture loading', () => {
    it('loads FastAPI documents with correct structure', () => {
      expect(fastApiNodes.length).toBeGreaterThanOrEqual(3);
      for (const node of fastApiNodes) {
        expect(node.id).toMatch(/^fastapi-/);
        expect(node.content.raw!.length).toBeGreaterThan(50);
        expect(node.embedding).toHaveLength(128);
        expect(node.embeddingModel).toBe('bag-of-words-128');
      }
    });

    it('loads Express.js documents with correct structure', () => {
      expect(expressNodes.length).toBeGreaterThanOrEqual(3);
      for (const node of expressNodes) {
        expect(node.id).toMatch(/^expressjs-/);
        expect(node.content.raw!.length).toBeGreaterThan(50);
        expect(node.embedding).toHaveLength(128);
      }
    });
  });

  describe('full pipeline without LLM', () => {
    it('runs all heuristic detectors and produces valid detections', async () => {
      const output = await runDetection({ nodes: allNodes, edges: [] });

      expect(output.stats.length).toBe(5);
      for (const stat of output.stats) {
        expect(stat.durationMs).toBeGreaterThanOrEqual(0);
        expect(typeof stat.detectionCount).toBe('number');
      }
      assertValidDetections(output.detections);
    });

    it('detects at least one issue across both doc sets', async () => {
      const output = await runDetection({ nodes: allNodes, edges: [] });
      expect(output.detections.length).toBeGreaterThanOrEqual(1);
    });

    it('returns detector names in stats', async () => {
      const output = await runDetection({ nodes: allNodes, edges: [] });
      const names = output.stats.map((s) => s.name);
      expect(names).toContain('detectContradictions');
      expect(names).toContain('detectStaleness');
      expect(names).toContain('detectTimeBombs');
    });
  });

  describe('full pipeline with mock LLM', () => {
    it('runs all detectors plus LLM-augmented layer', async () => {
      const output = await runDetection({
        nodes: allNodes,
        edges: [],
        llm: mockLlm,
      });

      const names = output.stats.map((s) => s.name);
      expect(names).toContain('llm-augmented');
      expect(output.stats.length).toBe(6);
      assertValidDetections(output.detections);
    });

    it('calls the mock LLM provider during detection', async () => {
      await runDetection({ nodes: allNodes, edges: [], llm: mockLlm });
      expect(mockLlm.complete).toHaveBeenCalled();
    });
  });

  describe('detection result structure', () => {
    it('every detection has required fields with correct types', async () => {
      const output = await runDetection({ nodes: allNodes, edges: [], llm: mockLlm });
      for (const det of output.detections) {
        expect(det).toHaveProperty('type');
        expect(det).toHaveProperty('severity');
        expect(det).toHaveProperty('nodeIds');
        expect(det).toHaveProperty('description');
        expect(typeof det.type).toBe('string');
        expect(typeof det.severity).toBe('string');
        expect(typeof det.description).toBe('string');
      }
    });

    it('nodeIds reference nodes that were provided as input', async () => {
      const nodeIdSet = new Set(allNodes.map((n) => n.id));
      const output = await runDetection({ nodes: allNodes, edges: [] });
      for (const det of output.detections) {
        for (const nid of det.nodeIds) {
          expect(nodeIdSet.has(nid)).toBe(true);
        }
      }
    });
  });

  describe('progress callback', () => {
    it('fires started and completed for each detector', async () => {
      const events: { name: string; status: string }[] = [];
      await runDetection({
        nodes: allNodes,
        edges: [],
        onProgress: (name, status) => { events.push({ name, status }); },
      });

      const started = events.filter((e) => e.status === 'started');
      const completed = events.filter((e) => e.status === 'completed');
      expect(started.length).toBeGreaterThanOrEqual(5);
      expect(completed.length).toBeGreaterThanOrEqual(5);
    });
  });
});

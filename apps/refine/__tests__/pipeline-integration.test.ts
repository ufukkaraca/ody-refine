/**
 * Integration tests for the full Refine pipeline.
 * Uses in-memory SQLite, mock embedding provider, and fixture markdown files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import {
  openDatabase,
  createSchema,
  SQLiteNodeRepository,
  SQLiteEdgeRepository,
  SqliteVecIndex,
  runDetection,
} from '@useody/platform-core';
import type { EmbeddingProvider } from '@useody/platform-core';
import { ingestDirectory } from '../src/ingest/pipeline.js';
import type { IngestLog } from '../src/ingest/pipeline.js';
import {
  detectContradictions,
  detectDuplicates,
  detectStaleness,
  detectUndocumented,
  detectTimeBombs,
} from '@useody/detectors';

const EMBED_DIM = 4;

/** Mock embedding provider returning deterministic fixed-dim vectors. */
function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    embed(text: string): Promise<number[]> {
      const hash = crypto.createHash('md5').update(text).digest();
      return Promise.resolve(
        Array.from({ length: EMBED_DIM }, (_, i) =>
          (hash[i % hash.length]! - 128) / 128,
        ),
      );
    },
    embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
    getModelId(): string {
      return 'mock-embed';
    },
    getDimension(): number {
      return EMBED_DIM;
    },
  };
}

/** In-memory IngestLog for tests. */
class MemoryIngestLog implements IngestLog {
  private readonly entries = new Map<string, string>();

  async getHash(filePath: string): Promise<string | null> {
    return this.entries.get(filePath) ?? null;
  }

  async record(filePath: string, hash: string, _nodeCount: number): Promise<void> {
    this.entries.set(filePath, hash);
  }
}

const DOC_API = [
  '# API Endpoints',
  '',
  'Our API uses REST with JSON responses.',
  'The authentication method is JWT tokens with a 24-hour expiry window.',
  'All endpoints require the Authorization header with a Bearer token.',
  'Rate limiting is set to 1000 requests per minute per API key.',
].join('\n');

const DOC_AUTH = [
  '# Authentication Guide',
  '',
  'Our API uses OAuth2 with session cookies for authentication.',
  'Tokens expire after 1 hour and must be refreshed via the /refresh endpoint.',
  'Session cookies are HttpOnly and SameSite=Strict for security.',
  'Rate limiting is 500 requests per minute per user session.',
].join('\n');

const DOC_DEPLOY = [
  '# Deployment Guide',
  '',
  'Deploy using Docker containers on AWS ECS.',
  'The primary database is PostgreSQL 15 with read replicas.',
  'Static assets are served via CloudFront CDN.',
  'Monitoring uses Datadog with custom dashboards for API latency.',
].join('\n');

describe('Pipeline Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `ody-refine-test-${crypto.randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('ingests markdown files and creates nodes', async () => {
    writeFileSync(join(tempDir, 'api.md'), DOC_API);
    writeFileSync(join(tempDir, 'auth.md'), DOC_AUTH);

    const db = openDatabase(':memory:');
    createSchema(db, EMBED_DIM);

    const nodeRepo = new SQLiteNodeRepository(db);
    const edgeRepo = new SQLiteEdgeRepository(db);
    const vecIndex = new SqliteVecIndex(db, EMBED_DIM);
    const ingestLog = new MemoryIngestLog();
    const embeddingProvider = createMockEmbeddingProvider();

    const summary = await ingestDirectory({
      directory: tempDir,
      nodeRepo,
      edgeRepo,
      vecIndex,
      embeddingProvider,
      ingestLog,
    });

    expect(summary.filesDiscovered).toBe(2);
    expect(summary.filesProcessed).toBe(2);
    expect(summary.filesSkipped).toBe(0);
    expect(summary.nodesStored).toBeGreaterThan(0);

    const nodeCount = await nodeRepo.count();
    expect(nodeCount).toBe(summary.nodesStored);
  });

  it('skips unchanged files on re-ingest (resumability)', async () => {
    writeFileSync(join(tempDir, 'api.md'), DOC_API);

    const db = openDatabase(':memory:');
    createSchema(db, EMBED_DIM);

    const nodeRepo = new SQLiteNodeRepository(db);
    const edgeRepo = new SQLiteEdgeRepository(db);
    const vecIndex = new SqliteVecIndex(db, EMBED_DIM);
    const ingestLog = new MemoryIngestLog();
    const embeddingProvider = createMockEmbeddingProvider();

    const opts = {
      directory: tempDir,
      nodeRepo,
      edgeRepo,
      vecIndex,
      embeddingProvider,
      ingestLog,
    };

    const first = await ingestDirectory(opts);
    expect(first.filesProcessed).toBe(1);
    expect(first.filesSkipped).toBe(0);

    const second = await ingestDirectory(opts);
    expect(second.filesProcessed).toBe(0);
    expect(second.filesSkipped).toBe(1);
  });

  it('re-ingests modified files', async () => {
    const filePath = join(tempDir, 'api.md');
    writeFileSync(filePath, DOC_API);

    const db = openDatabase(':memory:');
    createSchema(db, EMBED_DIM);

    const nodeRepo = new SQLiteNodeRepository(db);
    const edgeRepo = new SQLiteEdgeRepository(db);
    const vecIndex = new SqliteVecIndex(db, EMBED_DIM);
    const ingestLog = new MemoryIngestLog();
    const embeddingProvider = createMockEmbeddingProvider();

    const opts = {
      directory: tempDir,
      nodeRepo,
      edgeRepo,
      vecIndex,
      embeddingProvider,
      ingestLog,
    };

    await ingestDirectory(opts);
    writeFileSync(filePath, DOC_API + '\n\nNew section with additional content.\n');

    const second = await ingestDirectory(opts);
    expect(second.filesProcessed).toBe(1);
    expect(second.filesSkipped).toBe(0);
  });

  it('runs detection pipeline on ingested content', async () => {
    writeFileSync(join(tempDir, 'api.md'), DOC_API);
    writeFileSync(join(tempDir, 'auth.md'), DOC_AUTH);
    writeFileSync(join(tempDir, 'deploy.md'), DOC_DEPLOY);

    const db = openDatabase(':memory:');
    createSchema(db, EMBED_DIM);

    const nodeRepo = new SQLiteNodeRepository(db);
    const edgeRepo = new SQLiteEdgeRepository(db);
    const vecIndex = new SqliteVecIndex(db, EMBED_DIM);
    const ingestLog = new MemoryIngestLog();
    const embeddingProvider = createMockEmbeddingProvider();

    await ingestDirectory({
      directory: tempDir,
      nodeRepo,
      edgeRepo,
      vecIndex,
      embeddingProvider,
      ingestLog,
    });

    const result = await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [
        detectContradictions,
        detectDuplicates,
        detectStaleness,
        detectUndocumented,
        detectTimeBombs,
      ],
    });

    expect(result.stats.length).toBe(5);
    expect(Array.isArray(result.detections)).toBe(true);
    for (const d of result.detections) {
      expect(d.type).toBeDefined();
      expect(d.severity).toBeDefined();
      expect(d.description).toBeDefined();
    }
  });
});

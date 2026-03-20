/**
 * Tests for the export command with --with-resolutions and --format trl.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PreferencePair } from '@useody/platform-core';

const TMP = join(tmpdir(), 'ody-export-test-' + Date.now().toString(36));

let db: unknown;

function makePair(overrides: Partial<PreferencePair> = {}): PreferencePair {
  return {
    prompt: 'What is the rate limit?',
    chosen: 'The rate limit is 1000 requests per minute.',
    rejected: 'The rate limit is 500 requests per minute.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'cli-user',
      resolvedAt: new Date('2026-01-15T10:00:00Z'),
      confidence: 1.0,
      sourceNodeIds: ['node-a', 'node-b'],
    },
    ...overrides,
  };
}

describe('export with resolutions', () => {
  beforeAll(async () => {
    mkdirSync(TMP, { recursive: true });
    const core = await import('@useody/platform-core');
    db = core.openDatabase(join(TMP, 'test.db'));
    core.createSchema(db as ReturnType<typeof core.openDatabase>, 768);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('exports preference pairs via combined format', async () => {
    const { PreferencePairStore } = await import('@useody/feedback');
    const store = new PreferencePairStore(db);

    store.saveBatch([
      makePair(),
      makePair({ prompt: 'What is the SLA?' }),
    ]);

    const pairs = store.findAll();
    expect(pairs).toHaveLength(2);

    const { exportCombinedToJsonl } = await import('@useody/export');
    const content = exportCombinedToJsonl([], pairs);
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed['type']).toBe('preference_pair');
      expect(typeof parsed['prompt']).toBe('string');
      expect(typeof parsed['chosen']).toBe('string');
      expect(typeof parsed['rejected']).toBe('string');
    }
  });

  it('--format trl produces only prompt/chosen/rejected', async () => {
    const { PreferencePairStore } = await import('@useody/feedback');
    const store = new PreferencePairStore(db);
    const pairs = store.findAll();

    const { exportTrlDpoToJsonl } = await import('@useody/export');
    const content = exportTrlDpoToJsonl(pairs);
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(['chosen', 'prompt', 'rejected']);
      expect(parsed).not.toHaveProperty('metadata');
      expect(parsed).not.toHaveProperty('type');
    }
  });

  it('TRL format contains only prompt/chosen/rejected per line', async () => {
    const { PreferencePairStore } = await import('@useody/feedback');
    const store = new PreferencePairStore(db);
    const pairs = store.findAll();

    const { exportTrlDpoToJsonl } = await import('@useody/export');
    const content = exportTrlDpoToJsonl(pairs);
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines.length).toBe(pairs.length);
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      // TRL DPO format: only prompt, chosen, rejected — no metadata
      expect(typeof parsed['prompt']).toBe('string');
      expect(typeof parsed['chosen']).toBe('string');
      expect(typeof parsed['rejected']).toBe('string');
      expect(parsed).not.toHaveProperty('metadata');
      expect((parsed['prompt'] as string).length).toBeGreaterThan(0);
      expect((parsed['chosen'] as string).length).toBeGreaterThan(0);
      expect((parsed['rejected'] as string).length).toBeGreaterThan(0);
    }
  });

  it('findAll returns all pairs including previously exported', async () => {
    const { PreferencePairStore } = await import('@useody/feedback');
    const store = new PreferencePairStore(db);

    // Export DPO to mark pairs as exported
    const outPath = join(TMP, 'dpo-out.jsonl');
    store.exportDpo(outPath);

    // findAll should still return them
    const all = store.findAll();
    expect(all.length).toBeGreaterThan(0);

    // findUnexported should return 0 after exportDpo
    const unexported = store.findUnexported();
    expect(unexported).toHaveLength(0);
  });

  it('combined format includes both nodes and pairs', async () => {
    const core = await import('@useody/platform-core');
    const { exportCombinedToJsonl } = await import('@useody/export');
    const { PreferencePairStore } = await import('@useody/feedback');

    const nodeRepo = new core.SQLiteNodeRepository(
      db as ReturnType<typeof core.openDatabase>,
    );

    // Insert a test node
    await nodeRepo.upsert({
      id: 'test-node-1',
      title: 'API Docs',
      content: { summary: 'Rate limit documentation' },
      embedding: new Array(768).fill(0) as number[],
      embeddingModel: 'test',
      embeddingDim: 768,
      confidence: 0.95,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const nodes = await nodeRepo.findAll({});
    const store = new PreferencePairStore(db);
    const pairs = store.findAll();

    const content = exportCombinedToJsonl(nodes, pairs);
    const lines = content.split('\n');

    const types = lines.map((l) => {
      const parsed = JSON.parse(l) as Record<string, unknown>;
      return parsed['type'];
    });

    expect(types).toContain('node');
    expect(types).toContain('preference_pair');
    expect(lines.length).toBe(nodes.length + pairs.length);
  });
});

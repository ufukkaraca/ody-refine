import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createSchema } from '../src/sqlite/schema.js';
import { SQLiteNodeRepository } from '../src/sqlite/node-repository.js';
import type { KnowledgeNode } from '../src/types.js';

function makeNode(overrides?: Partial<KnowledgeNode>): KnowledgeNode {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    title: overrides?.title ?? 'Test Node',
    content: overrides?.content ?? { summary: 'A test summary' },
    embedding: overrides?.embedding ?? [0.1, 0.2, 0.3, 0.4],
    embeddingModel: overrides?.embeddingModel ?? 'test-model',
    embeddingDim: overrides?.embeddingDim ?? 4,
    confidence: overrides?.confidence ?? 0.9,
    metadata: overrides?.metadata,
    createdAt: overrides?.createdAt ?? new Date('2025-01-01'),
    updatedAt: overrides?.updatedAt ?? new Date('2025-01-01'),
  };
}

describe('SQLiteNodeRepository', () => {
  let db: Database.Database;
  let repo: SQLiteNodeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    createSchema(db, 4);
    repo = new SQLiteNodeRepository(db);
  });

  it('upserts and finds a node by ID', async () => {
    const node = makeNode({ id: 'node-1' });
    await repo.upsert(node);
    const found = await repo.findById('node-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('node-1');
    expect(found!.title).toBe('Test Node');
    expect(found!.content.summary).toBe('A test summary');
  });

  it('returns null for non-existent ID', async () => {
    const found = await repo.findById('nope');
    expect(found).toBeNull();
  });

  it('updates a node on re-upsert', async () => {
    const node = makeNode({ id: 'node-1' });
    await repo.upsert(node);
    const updated = makeNode({
      id: 'node-1',
      title: 'Updated Title',
      updatedAt: new Date('2025-06-01'),
    });
    await repo.upsert(updated);
    const found = await repo.findById('node-1');
    expect(found!.title).toBe('Updated Title');
    const count = await repo.count();
    expect(count).toBe(1);
  });

  it('findAll returns all nodes', async () => {
    await repo.upsert(makeNode({ id: 'a' }));
    await repo.upsert(makeNode({ id: 'b' }));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('findAll filters by embeddingModel', async () => {
    await repo.upsert(makeNode({ id: 'a', embeddingModel: 'model-a' }));
    await repo.upsert(makeNode({ id: 'b', embeddingModel: 'model-b' }));
    const filtered = await repo.findAll({ embeddingModel: 'model-a' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('a');
  });

  it('findAll filters by minConfidence', async () => {
    await repo.upsert(makeNode({ id: 'low', confidence: 0.3 }));
    await repo.upsert(makeNode({ id: 'high', confidence: 0.9 }));
    const filtered = await repo.findAll({ minConfidence: 0.5 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('high');
  });

  it('findAll filters by since date', async () => {
    await repo.upsert(makeNode({ id: 'old', updatedAt: new Date('2024-01-01') }));
    await repo.upsert(makeNode({ id: 'new', updatedAt: new Date('2025-06-01') }));
    const filtered = await repo.findAll({ since: new Date('2025-01-01') });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('new');
  });

  it('deletes a node', async () => {
    await repo.upsert(makeNode({ id: 'del-me' }));
    await repo.delete('del-me');
    const found = await repo.findById('del-me');
    expect(found).toBeNull();
  });

  it('count returns correct value', async () => {
    expect(await repo.count()).toBe(0);
    await repo.upsert(makeNode({ id: 'x' }));
    expect(await repo.count()).toBe(1);
  });

  it('stores and retrieves embedding as float array', async () => {
    const emb = [1.5, -2.5, 3.0, 0.0];
    await repo.upsert(makeNode({ id: 'emb', embedding: emb }));
    const found = await repo.findById('emb');
    expect(found!.embedding).toHaveLength(4);
    expect(found!.embedding[0]).toBeCloseTo(1.5);
    expect(found!.embedding[1]).toBeCloseTo(-2.5);
  });

  it('handles node with empty embedding', async () => {
    await repo.upsert(makeNode({ id: 'no-emb', embedding: [] }));
    const found = await repo.findById('no-emb');
    expect(found!.embedding).toEqual([]);
  });

  it('stores and retrieves metadata', async () => {
    const meta = { source: 'test', priority: 5 };
    await repo.upsert(makeNode({ id: 'meta', metadata: meta }));
    const found = await repo.findById('meta');
    expect(found!.metadata).toEqual(meta);
  });

  it('stores and retrieves content fields', async () => {
    const node = makeNode({
      id: 'rich',
      content: {
        summary: 'Summary',
        facts: ['fact1', 'fact2'],
        entities: [{ name: 'Ody', type: 'product' }],
        source: { sourceType: 'notion', sourceId: 'page-1' },
        raw: 'Raw text here',
      },
    });
    await repo.upsert(node);
    const found = await repo.findById('rich');
    expect(found!.content.facts).toEqual(['fact1', 'fact2']);
    expect(found!.content.entities).toEqual([{ name: 'Ody', type: 'product' }]);
    expect(found!.content.source?.sourceType).toBe('notion');
    expect(found!.content.raw).toBe('Raw text here');
  });
});

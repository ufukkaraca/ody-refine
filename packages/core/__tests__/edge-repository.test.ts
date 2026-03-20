import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createSchema } from '../src/sqlite/schema.js';
import { SQLiteNodeRepository } from '../src/sqlite/node-repository.js';
import { SQLiteEdgeRepository } from '../src/sqlite/edge-repository.js';
import type { KnowledgeEdge, KnowledgeNode } from '../src/types.js';

function makeNode(id: string): KnowledgeNode {
  return {
    id,
    title: `Node ${id}`,
    content: { summary: `Summary for ${id}` },
    embedding: [0.1, 0.2, 0.3, 0.4],
    embeddingModel: 'test',
    embeddingDim: 4,
    confidence: 1.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(overrides?: Partial<KnowledgeEdge>): KnowledgeEdge {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    sourceId: overrides?.sourceId ?? 'node-a',
    targetId: overrides?.targetId ?? 'node-b',
    type: overrides?.type ?? 'related',
    reason: overrides?.reason ?? 'test reason',
    confidence: overrides?.confidence ?? 1.0,
    metadata: overrides?.metadata,
    createdAt: overrides?.createdAt ?? new Date(),
  };
}

describe('SQLiteEdgeRepository', () => {
  let db: Database.Database;
  let nodeRepo: SQLiteNodeRepository;
  let edgeRepo: SQLiteEdgeRepository;

  beforeEach(async () => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    createSchema(db, 4);
    nodeRepo = new SQLiteNodeRepository(db);
    edgeRepo = new SQLiteEdgeRepository(db);
    await nodeRepo.upsert(makeNode('node-a'));
    await nodeRepo.upsert(makeNode('node-b'));
    await nodeRepo.upsert(makeNode('node-c'));
  });

  it('upserts and finds edges by node ID (source)', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1', sourceId: 'node-a', targetId: 'node-b' }));
    const found = await edgeRepo.findByNodeId('node-a');
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('e1');
  });

  it('findByNodeId returns edges where node is target', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1', sourceId: 'node-a', targetId: 'node-b' }));
    const found = await edgeRepo.findByNodeId('node-b');
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('e1');
  });

  it('findByNodeId returns edges in both directions', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1', sourceId: 'node-a', targetId: 'node-b' }));
    await edgeRepo.upsert(makeEdge({ id: 'e2', sourceId: 'node-c', targetId: 'node-a' }));
    const found = await edgeRepo.findByNodeId('node-a');
    expect(found).toHaveLength(2);
  });

  it('findByType filters correctly', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1', type: 'contradicts' }));
    await edgeRepo.upsert(makeEdge({ id: 'e2', type: 'related' }));
    const contradictions = await edgeRepo.findByType('contradicts');
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]!.type).toBe('contradicts');
  });

  it('findAll returns all edges', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1' }));
    await edgeRepo.upsert(makeEdge({ id: 'e2' }));
    const all = await edgeRepo.findAll();
    expect(all).toHaveLength(2);
  });

  it('deletes an edge', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1' }));
    await edgeRepo.delete('e1');
    const all = await edgeRepo.findAll();
    expect(all).toHaveLength(0);
  });

  it('updates an edge on re-upsert', async () => {
    await edgeRepo.upsert(makeEdge({ id: 'e1', reason: 'original' }));
    await edgeRepo.upsert(makeEdge({ id: 'e1', reason: 'updated' }));
    const all = await edgeRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.reason).toBe('updated');
  });

  it('stores and retrieves metadata', async () => {
    const meta = { score: 42 };
    await edgeRepo.upsert(makeEdge({ id: 'e1', metadata: meta }));
    const [edge] = await edgeRepo.findAll();
    expect(edge!.metadata).toEqual(meta);
  });
});

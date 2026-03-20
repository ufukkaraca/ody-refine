import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createSchema } from '../src/sqlite/schema.js';
import { SqliteVecIndex } from '../src/sqlite/vec-index.js';

describe('SqliteVecIndex', () => {
  let db: Database.Database;
  let vecIndex: SqliteVecIndex;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    createSchema(db, 4);
    vecIndex = new SqliteVecIndex(db, 4);
  });

  it('add and search returns the added vector', async () => {
    await vecIndex.add('v1', [1, 0, 0, 0]);
    const results = await vecIndex.search([1, 0, 0, 0], 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('v1');
    expect(results[0]!.distance).toBeCloseTo(0);
  });

  it('search returns nearest vectors ordered by distance', async () => {
    await vecIndex.add('close', [1, 0, 0, 0]);
    await vecIndex.add('far', [0, 0, 0, 1]);
    const results = await vecIndex.search([1, 0, 0, 0], 5);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('close');
    expect(results[0]!.distance).toBeLessThan(results[1]!.distance);
  });

  it('respects topK limit', async () => {
    await vecIndex.add('a', [1, 0, 0, 0]);
    await vecIndex.add('b', [0, 1, 0, 0]);
    await vecIndex.add('c', [0, 0, 1, 0]);
    const results = await vecIndex.search([1, 0, 0, 0], 2);
    expect(results).toHaveLength(2);
  });

  it('filters by minSimilarity', async () => {
    await vecIndex.add('close', [1, 0, 0, 0]);
    await vecIndex.add('far', [0, 0, 0, 1]);
    // With high minSimilarity, far vector should be filtered out
    // distance = 1 - similarity, so minSimilarity=0.9 means maxDistance=0.1
    const results = await vecIndex.search([1, 0, 0, 0], 5, 0.9);
    // Only the exact match should pass (distance ≈ 0)
    expect(results.length).toBeLessThanOrEqual(1);
    if (results.length > 0) {
      expect(results[0]!.id).toBe('close');
    }
  });

  it('remove deletes a vector', async () => {
    await vecIndex.add('v1', [1, 0, 0, 0]);
    await vecIndex.remove('v1');
    const results = await vecIndex.search([1, 0, 0, 0], 5);
    expect(results).toHaveLength(0);
  });

  it('count returns the number of vectors', async () => {
    expect(await vecIndex.count()).toBe(0);
    await vecIndex.add('a', [1, 0, 0, 0]);
    await vecIndex.add('b', [0, 1, 0, 0]);
    expect(await vecIndex.count()).toBe(2);
  });

  it('search on empty index returns empty', async () => {
    const results = await vecIndex.search([1, 0, 0, 0], 5);
    expect(results).toHaveLength(0);
  });

  it('rejects embeddings with wrong dimension', async () => {
    await expect(vecIndex.add('bad', [1, 0, 0])).rejects.toThrow(
      'Embedding dimension mismatch: expected 4, got 3',
    );
  });

  it('rejects queries with wrong dimension', async () => {
    await expect(vecIndex.search([1, 0], 5)).rejects.toThrow(
      'Query dimension mismatch: expected 4, got 2',
    );
  });

  it('replaces embedding on re-add', async () => {
    await vecIndex.add('v1', [1, 0, 0, 0]);
    await vecIndex.add('v1', [0, 1, 0, 0]);
    const results = await vecIndex.search([0, 1, 0, 0], 1);
    expect(results[0]!.id).toBe('v1');
    expect(results[0]!.distance).toBeCloseTo(0);
    expect(await vecIndex.count()).toBe(1);
  });
});

/**
 * SQLite-vec backed implementation of VectorIndex.
 * Uses cosine distance metric (distance = 1 - cosine_similarity).
 * @module sqlite/vec-index
 */
import type Database from 'better-sqlite3';
import type { SearchResult, VectorIndex } from '../types.js';

/** Convert a number[] embedding to a Float32Array buffer for sqlite-vec. */
function toFloat32Buffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

/** Vector similarity index backed by the sqlite-vec vec0 virtual table. */
export class SqliteVecIndex implements VectorIndex {
  private readonly db: Database.Database;
  private readonly dimension: number;

  constructor(db: Database.Database, dimension: number) {
    this.db = db;
    this.dimension = dimension;
  }

  /** Add or replace a vector in the index. */
  async add(id: string, embedding: number[]): Promise<void> {
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}. ` +
          'This usually means the embedding provider changed. Re-ingest to fix.',
      );
    }
    const buf = toFloat32Buffer(embedding);
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM vec_nodes WHERE id = ?').run(id);
      this.db.prepare('INSERT INTO vec_nodes (id, embedding) VALUES (?, ?)').run(id, buf);
    });
    txn();
  }

  /**
   * Search for the nearest vectors to a query embedding.
   * Returns cosine distance (0 = identical, 1 = orthogonal, 2 = opposite).
   */
  async search(
    query: number[],
    topK: number,
    minSimilarity?: number,
  ): Promise<SearchResult[]> {
    if (query.length !== this.dimension) {
      throw new Error(
        `Query dimension mismatch: expected ${this.dimension}, got ${query.length}`,
      );
    }
    const rows = this.db
      .prepare(
        'SELECT id, distance FROM vec_nodes WHERE embedding MATCH ? ORDER BY distance LIMIT ?',
      )
      .all(toFloat32Buffer(query), topK) as { id: string; distance: number }[];

    if (minSimilarity !== undefined) {
      // With cosine distance_metric: distance = 1 - cosine_similarity
      const maxDistance = 1 - minSimilarity;
      return rows
        .filter((r) => r.distance <= maxDistance)
        .map((r) => ({ id: r.id, distance: r.distance }));
    }

    return rows.map((r) => ({ id: r.id, distance: r.distance }));
  }

  /** Remove a vector from the index. */
  async remove(id: string): Promise<void> {
    this.db.prepare('DELETE FROM vec_nodes WHERE id = ?').run(id);
  }

  /** Count total vectors in the index. */
  async count(): Promise<number> {
    const row = this.db.prepare('SELECT count(*) as cnt FROM vec_nodes').get() as
      | { cnt: number }
      | undefined;
    return row?.cnt ?? 0;
  }
}

/**
 * SQLite implementation of NodeRepository.
 * @module sqlite/node-repository
 */
import type Database from 'better-sqlite3';
import type {
  KnowledgeNode,
  NodeContent,
  NodeFilter,
  NodeRepository,
} from '../types.js';

/** Convert a Float32Array embedding to a Buffer for SQLite BLOB storage. */
function embeddingToBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

/** Convert a SQLite BLOB Buffer back to a number array. */
function bufferToEmbedding(buf: Buffer): number[] {
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(f32);
}

/** Deserialize a SQLite row into a KnowledgeNode. */
function rowToNode(row: Record<string, unknown>): KnowledgeNode {
  const content: NodeContent = {
    summary: row['content_summary'] as string,
  };
  if (row['content_facts']) {
    content.facts = JSON.parse(row['content_facts'] as string) as string[];
  }
  if (row['content_entities']) {
    content.entities = JSON.parse(row['content_entities'] as string) as NodeContent['entities'];
  }
  if (row['content_source']) {
    content.source = JSON.parse(row['content_source'] as string) as NodeContent['source'];
  }
  if (row['content_raw']) {
    content.raw = row['content_raw'] as string;
  }

  return {
    id: row['id'] as string,
    title: row['title'] as string,
    content,
    embedding: row['embedding'] ? bufferToEmbedding(row['embedding'] as Buffer) : [],
    embeddingModel: row['embedding_model'] as string,
    embeddingDim: row['embedding_dim'] as number,
    confidence: row['confidence'] as number,
    metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) as Record<string, unknown> : undefined,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

/** SQLite-backed implementation of the NodeRepository interface. */
export class SQLiteNodeRepository implements NodeRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Insert or update a knowledge node. */
  async upsert(node: KnowledgeNode): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_nodes
        (id, title, content_summary, content_facts, content_entities,
         content_source, content_raw, embedding, embedding_model,
         embedding_dim, confidence, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      node.id,
      node.title,
      node.content.summary,
      node.content.facts ? JSON.stringify(node.content.facts) : null,
      node.content.entities ? JSON.stringify(node.content.entities) : null,
      node.content.source ? JSON.stringify(node.content.source) : null,
      node.content.raw ?? null,
      node.embedding.length > 0 ? embeddingToBuffer(node.embedding) : null,
      node.embeddingModel,
      node.embeddingDim,
      node.confidence,
      node.metadata ? JSON.stringify(node.metadata) : null,
      node.createdAt.toISOString(),
      node.updatedAt.toISOString(),
    );
  }

  /** Find a node by its ID, or return null. */
  async findById(id: string): Promise<KnowledgeNode | null> {
    const row = this.db.prepare('SELECT * FROM knowledge_nodes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToNode(row) : null;
  }

  /** Find all nodes matching optional filters. */
  async findAll(filter?: NodeFilter): Promise<KnowledgeNode[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter?.embeddingModel) {
      clauses.push('embedding_model = ?');
      params.push(filter.embeddingModel);
    }
    if (filter?.minConfidence !== undefined) {
      clauses.push('confidence >= ?');
      params.push(filter.minConfidence);
    }
    if (filter?.since) {
      clauses.push('updated_at >= ?');
      params.push(filter.since.toISOString());
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM knowledge_nodes ${where}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  /** Delete a node by ID. */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM knowledge_nodes WHERE id = ?').run(id);
  }

  /** Count all nodes. */
  async count(): Promise<number> {
    const row = this.db.prepare('SELECT count(*) as cnt FROM knowledge_nodes').get() as
      | Record<string, unknown>
      | undefined;
    return (row?.['cnt'] as number) ?? 0;
  }
}

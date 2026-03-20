/**
 * SQLite implementation of EdgeRepository.
 * @module sqlite/edge-repository
 */
import type Database from 'better-sqlite3';
import type { EdgeRepository, EdgeType, KnowledgeEdge } from '../types.js';

/** Deserialize a SQLite row into a KnowledgeEdge. */
function rowToEdge(row: Record<string, unknown>): KnowledgeEdge {
  return {
    id: row['id'] as string,
    sourceId: row['source_id'] as string,
    targetId: row['target_id'] as string,
    type: row['type'] as EdgeType,
    reason: row['reason'] as string,
    confidence: row['confidence'] as number,
    metadata: row['metadata']
      ? (JSON.parse(row['metadata'] as string) as Record<string, unknown>)
      : undefined,
    createdAt: row['created_at'] ? new Date(row['created_at'] as string) : undefined,
  };
}

/** SQLite-backed implementation of the EdgeRepository interface. */
export class SQLiteEdgeRepository implements EdgeRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Insert or update an edge. */
  async upsert(edge: KnowledgeEdge): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_edges
        (id, source_id, target_id, type, reason, confidence, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      edge.id,
      edge.sourceId,
      edge.targetId,
      edge.type,
      edge.reason,
      edge.confidence,
      edge.metadata ? JSON.stringify(edge.metadata) : null,
      edge.createdAt ? edge.createdAt.toISOString() : new Date().toISOString(),
    );
  }

  /** Find all edges where nodeId is either source or target. */
  async findByNodeId(nodeId: string): Promise<KnowledgeEdge[]> {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_edges WHERE source_id = ? OR target_id = ?')
      .all(nodeId, nodeId) as Record<string, unknown>[];
    return rows.map(rowToEdge);
  }

  /** Find all edges of a given type. */
  async findByType(type: EdgeType): Promise<KnowledgeEdge[]> {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_edges WHERE type = ?')
      .all(type) as Record<string, unknown>[];
    return rows.map(rowToEdge);
  }

  /** Find all edges. */
  async findAll(): Promise<KnowledgeEdge[]> {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_edges')
      .all() as Record<string, unknown>[];
    return rows.map(rowToEdge);
  }

  /** Delete an edge by ID. */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM knowledge_edges WHERE id = ?').run(id);
  }
}

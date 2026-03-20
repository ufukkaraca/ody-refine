/**
 * Dataset version registry backed by SQLite.
 * @module training/dataset-registry
 */

import type Database from 'better-sqlite3';
import type { DatasetVersion, DatasetLineage } from './types.js';

/** Delta between two dataset versions. */
export interface DatasetDiff {
  fromVersion: string;
  toVersion: string;
  nodeCountDelta: number;
  preferencePairDelta: number;
  sftEntryDelta: number;
  evalItemDelta: number;
}

/** Row shape from SQLite dataset_versions table. */
interface DatasetRow {
  id: string;
  version: string;
  data_path: string;
  node_count: number;
  preference_pair_count: number;
  sft_entry_count: number;
  eval_item_count: number;
  source_audit_id: string | null;
  lineage_parent_version_id: string | null;
  lineage_source_type: string;
  lineage_refined_at: string | null;
  lineage_node_filter: string | null;
  created_at: string;
}

/** Registry for managing dataset versions in SQLite. */
export class DatasetRegistry {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Insert a new dataset version. */
  create(version: DatasetVersion): DatasetVersion {
    const stmt = this.db.prepare(`
      INSERT INTO dataset_versions
        (id, version, data_path, node_count, preference_pair_count,
         sft_entry_count, eval_item_count, source_audit_id,
         lineage_parent_version_id, lineage_source_type,
         lineage_refined_at, lineage_node_filter, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      version.id,
      version.version,
      version.dataPath,
      version.nodeCount,
      version.preferencePairCount,
      version.sftEntryCount,
      version.evalItemCount,
      version.sourceAuditId ?? null,
      version.lineage.parentVersionId ?? null,
      version.lineage.sourceType,
      version.lineage.refinedAt?.toISOString() ?? null,
      version.lineage.nodeFilter
        ? JSON.stringify(version.lineage.nodeFilter)
        : null,
      version.createdAt.toISOString(),
    );
    return version;
  }

  /** Find a dataset version by ID. */
  findById(id: string): DatasetVersion | null {
    const row = this.db.prepare(
      'SELECT * FROM dataset_versions WHERE id = ?',
    ).get(id) as DatasetRow | undefined;
    return row ? this.toDatasetVersion(row) : null;
  }

  /** List all dataset versions, most recent first. */
  list(): DatasetVersion[] {
    const rows = this.db.prepare(
      'SELECT * FROM dataset_versions ORDER BY created_at DESC',
    ).all() as DatasetRow[];
    return rows.map((r) => this.toDatasetVersion(r));
  }

  /** Compare two dataset versions and return the delta. */
  diff(v1Id: string, v2Id: string): DatasetDiff {
    const v1 = this.findById(v1Id);
    const v2 = this.findById(v2Id);
    if (!v1) throw new Error(`Dataset version not found: ${v1Id}`);
    if (!v2) throw new Error(`Dataset version not found: ${v2Id}`);
    return {
      fromVersion: v1.version,
      toVersion: v2.version,
      nodeCountDelta: v2.nodeCount - v1.nodeCount,
      preferencePairDelta: v2.preferencePairCount - v1.preferencePairCount,
      sftEntryDelta: v2.sftEntryCount - v1.sftEntryCount,
      evalItemDelta: v2.evalItemCount - v1.evalItemCount,
    };
  }

  /** Walk the parentVersionId chain and return the full lineage. */
  getLineage(id: string): DatasetVersion[] {
    const chain: DatasetVersion[] = [];
    let currentId: string | undefined = id;
    while (currentId) {
      const version = this.findById(currentId);
      if (!version) break;
      chain.push(version);
      currentId = version.lineage.parentVersionId;
    }
    return chain;
  }

  private toDatasetVersion(row: DatasetRow): DatasetVersion {
    const lineage: DatasetLineage = {
      sourceType: row.lineage_source_type as DatasetLineage['sourceType'],
      parentVersionId: row.lineage_parent_version_id ?? undefined,
      refinedAt: row.lineage_refined_at
        ? new Date(row.lineage_refined_at)
        : undefined,
      nodeFilter: row.lineage_node_filter
        ? (JSON.parse(row.lineage_node_filter) as Record<string, unknown>)
        : undefined,
    };
    return {
      id: row.id,
      version: row.version,
      dataPath: row.data_path,
      nodeCount: row.node_count,
      preferencePairCount: row.preference_pair_count,
      sftEntryCount: row.sft_entry_count,
      evalItemCount: row.eval_item_count,
      sourceAuditId: row.source_audit_id ?? undefined,
      lineage,
      createdAt: new Date(row.created_at),
    };
  }
}

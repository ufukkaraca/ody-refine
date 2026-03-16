/**
 * JSONL export functions for knowledge nodes and preference pairs.
 * @module jsonl
 */

import type {
  KnowledgeNode,
  ExportOptions,
  PreferencePair,
} from '@useody/platform-core';

/**
 * Serialize a single knowledge node to a plain object suitable for JSON.
 * Strips embedding data to keep output compact.
 */
function nodeToRecord(
  node: KnowledgeNode,
  includeMetadata: boolean,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: node.id,
    title: node.title,
    content: node.content,
    confidence: node.confidence,
    embeddingModel: node.embeddingModel,
    embeddingDim: node.embeddingDim,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
  if (includeMetadata && node.metadata) {
    record['metadata'] = node.metadata;
  }
  return record;
}

/**
 * Export knowledge nodes to JSONL format.
 * One JSON line per node. Respects filterByConfidence. Empty array returns empty string.
 */
export function exportNodesToJsonl(
  nodes: KnowledgeNode[],
  options?: ExportOptions,
): string {
  if (nodes.length === 0) return '';

  const minConfidence = options?.filterByConfidence ?? 0;
  const includeMetadata = options?.includeMetadata ?? true;

  const filtered = nodes.filter((n) => n.confidence >= minConfidence);
  if (filtered.length === 0) return '';

  return filtered
    .map((node) => JSON.stringify(nodeToRecord(node, includeMetadata)))
    .join('\n');
}

/**
 * Export preference pairs to JSONL format.
 * One JSON line per pair. Includes all metadata fields.
 */
export function exportPreferencePairsToJsonl(
  pairs: PreferencePair[],
): string {
  if (pairs.length === 0) return '';

  return pairs
    .map((pair) =>
      JSON.stringify({
        prompt: pair.prompt,
        chosen: pair.chosen,
        rejected: pair.rejected,
        metadata: {
          conflictType: pair.metadata.conflictType,
          resolvedBy: pair.metadata.resolvedBy,
          resolvedAt: pair.metadata.resolvedAt.toISOString(),
          confidence: pair.metadata.confidence,
          sourceNodeIds: pair.metadata.sourceNodeIds,
        },
      }),
    )
    .join('\n');
}

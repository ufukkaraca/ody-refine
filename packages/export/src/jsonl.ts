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

/** Serialize a preference pair as a typed JSONL record with `"type": "preference_pair"`. */
function pairToTypedRecord(pair: PreferencePair): Record<string, unknown> {
  return {
    type: 'preference_pair',
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
  };
}

/**
 * Export nodes and preference pairs to a combined JSONL format.
 * Node lines carry `"type": "node"`, pair lines carry `"type": "preference_pair"`.
 * Forge's `from-refine` command auto-detects the type field.
 */
export function exportCombinedToJsonl(
  nodes: KnowledgeNode[],
  pairs: PreferencePair[],
  options?: ExportOptions,
): string {
  const minConfidence = options?.filterByConfidence ?? 0;
  const includeMetadata = options?.includeMetadata ?? true;

  const filteredNodes = nodes.filter((n) => n.confidence >= minConfidence);

  const nodeLines = filteredNodes.map((node) =>
    JSON.stringify({ type: 'node', ...nodeToRecord(node, includeMetadata) }),
  );
  const pairLines = pairs.map((pair) =>
    JSON.stringify(pairToTypedRecord(pair)),
  );

  const allLines = [...nodeLines, ...pairLines];
  return allLines.length === 0 ? '' : allLines.join('\n');
}

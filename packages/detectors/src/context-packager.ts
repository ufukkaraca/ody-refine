/**
 * Context packager for LLM-augmented detection.
 * Groups KnowledgeNodes by shared entities/topics into structured
 * context packages suitable for chain-of-thought LLM analysis.
 * @module detectors/context-packager
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  ContextPackage,
  SourceMeta,
} from '@useody/platform-core';

/** Minimum nodes required for a useful context package. */
const MIN_PACKAGE_SIZE = 2;

/** Maximum nodes per package to keep within LLM context limits. */
const MAX_PACKAGE_SIZE = 10;

/** Minimum shared entities to form a package. */
const MIN_SHARED_ENTITIES = 1;

/**
 * Extract valid entity names from a node, guarding against malformed data.
 * Returns lowercase names only for entities with non-empty string names.
 */
export function extractEntityNames(node: KnowledgeNode): Set<string> {
  const entities = node.content.entities;
  if (!Array.isArray(entities)) return new Set();
  const names = new Set<string>();
  for (const ent of entities) {
    if (
      ent !== null &&
      typeof ent === 'object' &&
      typeof ent.name === 'string' &&
      ent.name.trim().length > 0
    ) {
      names.add(ent.name.toLowerCase().trim());
    }
  }
  return names;
}

/**
 * Group nodes by shared entities into clusters.
 * Uses union-find to merge nodes that share at least MIN_SHARED_ENTITIES.
 */
export function groupByEntity(
  nodes: KnowledgeNode[],
): Map<string, KnowledgeNode[]> {
  const nodeEntities = new Map<string, Set<string>>();
  const entityToNodes = new Map<string, Set<string>>();

  for (const node of nodes) {
    const names = extractEntityNames(node);
    nodeEntities.set(node.id, names);
    for (const name of names) {
      const existing = entityToNodes.get(name);
      if (existing) {
        existing.add(node.id);
      } else {
        entityToNodes.set(name, new Set([node.id]));
      }
    }
  }

  // Union-find: merge nodes that share entities
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    let root = parent.get(id)!;
    while (root !== parent.get(root)) {
      root = parent.get(root)!;
    }
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Merge nodes sharing entities
  for (const [, nodeIds] of entityToNodes) {
    const ids = [...nodeIds];
    for (let i = 1; i < ids.length; i++) {
      union(ids[0]!, ids[i]!);
    }
  }

  // Filter: only keep clusters where nodes share at least MIN_SHARED_ENTITIES
  const clusters = new Map<string, KnowledgeNode[]>();

  for (const node of nodes) {
    const root = find(node.id);
    const existing = clusters.get(root);
    if (existing) {
      existing.push(node);
    } else {
      clusters.set(root, [node]);
    }
  }

  // Validate each cluster has meaningful entity overlap
  const validated = new Map<string, KnowledgeNode[]>();
  for (const [root, clusterNodes] of clusters) {
    if (clusterNodes.length < MIN_PACKAGE_SIZE) continue;

    // Find entities shared across at least 2 nodes
    const entityCounts = new Map<string, number>();
    for (const node of clusterNodes) {
      const ents = nodeEntities.get(node.id) ?? new Set();
      for (const e of ents) {
        entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
      }
    }
    const shared = [...entityCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([name]) => name);

    if (shared.length >= MIN_SHARED_ENTITIES) {
      validated.set(root, clusterNodes);
    }
  }

  return validated;
}

/**
 * Build source metadata for a node.
 * Extracts source type, author info, and modification date from node metadata.
 */
export function buildSourceMeta(node: KnowledgeNode): SourceMeta {
  const source = node.content.source;
  const meta = node.metadata ?? {};
  return {
    nodeId: node.id,
    sourceType: source?.sourceType ?? 'unknown',
    author: typeof meta['author'] === 'string' ? meta['author'] : undefined,
    authorRole: typeof meta['authorRole'] === 'string'
      ? meta['authorRole']
      : undefined,
    lastModified: source?.lastModified,
  };
}

/**
 * Find shared entity names across a set of nodes.
 * Returns entities that appear in at least 2 nodes.
 */
function findSharedEntities(nodes: KnowledgeNode[]): string[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const names = extractEntityNames(node);
    for (const name of names) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([name]) => name)
    .sort();
}

/**
 * Filter edges to those connecting nodes within a set.
 */
function filterEdgesForNodes(
  edges: KnowledgeEdge[],
  nodeIds: Set<string>,
): KnowledgeEdge[] {
  return edges.filter(
    (e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId),
  );
}

/**
 * Build context packages from knowledge nodes and edges.
 * Groups nodes by shared entities into packages suitable for LLM analysis.
 */
export function buildContextPackages(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): ContextPackage[] {
  const clusters = groupByEntity(nodes);
  const packages: ContextPackage[] = [];

  for (const [clusterId, clusterNodes] of clusters) {
    // Split large clusters into chunks of MAX_PACKAGE_SIZE
    for (let i = 0; i < clusterNodes.length; i += MAX_PACKAGE_SIZE) {
      const chunk = clusterNodes.slice(i, i + MAX_PACKAGE_SIZE);
      if (chunk.length < MIN_PACKAGE_SIZE) continue;

      const nodeIds = new Set(chunk.map((n) => n.id));
      const sharedEntities = findSharedEntities(chunk);
      const topic = sharedEntities.slice(0, 3).join(', ') || 'general';

      packages.push({
        id: `pkg-${clusterId}-${i}`,
        topic,
        nodes: chunk,
        edges: filterEdgesForNodes(edges, nodeIds),
        sharedEntities,
        sourceMetadata: chunk.map(buildSourceMeta),
      });
    }
  }

  return packages;
}

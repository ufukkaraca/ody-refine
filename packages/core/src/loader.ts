/**
 * Detection orchestrator — wires repositories, vector index, and detectors.
 * @module loader
 */
import type {
  Detection,
  DetectorFn,
  KnowledgeEdge,
  KnowledgeNode,
  LLMProvider,
  NodeRepository,
  EdgeRepository,
  VectorIndex,
} from './types.js';

/** Options for running detection across the knowledge graph. */
export interface RunDetectionOptions {
  nodeRepo: NodeRepository;
  edgeRepo: EdgeRepository;
  vecIndex: VectorIndex;
  detectors: DetectorFn[];
  llm?: LLMProvider;
  onProgress?: (detector: string, status: string) => void;
}

/** Stats for a single detector run. */
export interface DetectorStats {
  detectorName: string;
  nodeCount: number;
  detectionCount: number;
  durationMs: number;
}

/** Result of running all detectors. */
export interface DetectionResult {
  detections: Detection[];
  stats: DetectorStats[];
}

/**
 * Run all detectors against the knowledge graph.
 *
 * For each detector:
 * - If preFilter.requireAllNodes is true, pass all nodes.
 * - Otherwise, for each node, search the vector index for candidates,
 *   collect the union of candidate IDs, and filter nodes/edges to that set.
 */
export async function runDetection(
  options: RunDetectionOptions,
): Promise<DetectionResult> {
  const { nodeRepo, edgeRepo, vecIndex, detectors, llm, onProgress } = options;

  const allNodes = await nodeRepo.findAll();
  const allEdges = await edgeRepo.findAll();

  const allDetections: Detection[] = [];
  const allStats: DetectorStats[] = [];

  for (const detector of detectors) {
    const name = detector.name || 'unknown';
    onProgress?.(name, 'started');
    const start = Date.now();

    let candidateNodes: KnowledgeNode[];
    let candidateEdges: KnowledgeEdge[];

    if (detector.preFilter.requireAllNodes) {
      candidateNodes = allNodes;
      candidateEdges = allEdges;
    } else {
      const candidateIds = await collectCandidateIds(
        allNodes,
        vecIndex,
        detector.preFilter.topK,
        detector.preFilter.similarityThreshold,
      );
      candidateNodes = allNodes.filter((n) => candidateIds.has(n.id));
      candidateEdges = allEdges.filter(
        (e) => candidateIds.has(e.sourceId) || candidateIds.has(e.targetId),
      );
    }

    const rawDetections = await detector(candidateNodes, candidateEdges, llm);
    const durationMs = Date.now() - start;

    const nodeMap = new Map<string, KnowledgeNode>();
    for (const node of candidateNodes) nodeMap.set(node.id, node);

    const detections = rawDetections.map((det) => {
      const nodes = det.nodeIds
        .map((id) => {
          const node = nodeMap.get(id);
          if (!node) return null;
          const raw = node.content.raw ?? node.content.summary ?? '';
          const excerpt = raw.length > 150 ? raw.slice(0, 150) + '...' : raw;
          return {
            id,
            title: node.title,
            source: node.content.source?.sourceId ?? null,
            excerpt,
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);
      return { ...det, metadata: { ...det.metadata, nodes } };
    });

    allDetections.push(...detections);
    allStats.push({
      detectorName: name,
      nodeCount: candidateNodes.length,
      detectionCount: detections.length,
      durationMs,
    });

    onProgress?.(name, 'completed');
  }

  return { detections: allDetections, stats: allStats };
}

async function collectCandidateIds(
  nodes: KnowledgeNode[],
  vecIndex: VectorIndex,
  topK: number,
  similarityThreshold: number,
): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const node of nodes) {
    if (node.embedding.length === 0) continue;
    ids.add(node.id);
    const results = await vecIndex.search(
      node.embedding,
      topK,
      similarityThreshold,
    );
    for (const r of results) {
      ids.add(r.id);
    }
  }

  return ids;
}

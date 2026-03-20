/**
 * Undocumented topic detector.
 * Finds topics frequently discussed in chat with no matching documentation.
 * @module undocumented
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';
import {
  sharedTokens,
  lexicalScore,
  buildSignal,
} from './helpers/text-utils.js';

const CHAT_SOURCE_TYPES = new Set(['slack', 'teams', 'discord', 'chat']);
const DOC_SOURCE_TYPES = new Set([
  'markdown', 'pdf', 'notion', 'confluence', 'linear', 'jira',
]);

interface TopicCluster {
  topic: string;
  nodeIds: string[];
  facts: string[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function buildClusters(chatNodes: KnowledgeNode[]): TopicCluster[] {
  const clusters: TopicCluster[] = [];
  const assigned = new Set<string>();

  for (const node of chatNodes) {
    if (assigned.has(node.id)) continue;
    if (node.embedding.length === 0) continue;

    const similar = chatNodes.filter(
      (other) =>
        other.id !== node.id &&
        !assigned.has(other.id) &&
        other.embedding.length > 0 &&
        cosineSimilarity(node.embedding, other.embedding) > 0.64,
    );

    const clusterIds = [node.id, ...similar.map((s) => s.id)];
    if (clusterIds.length < 3) continue;

    for (const id of clusterIds) assigned.add(id);

    const allFacts = [
      ...(node.content.facts ?? []),
      ...similar.flatMap((s) => s.content.facts ?? []),
    ];

    clusters.push({
      topic: node.title,
      nodeIds: clusterIds,
      facts: [...new Set(allFacts)].slice(0, 10),
    });
  }

  return clusters;
}

/**
 * Detect topics discussed frequently in chat with no documentation.
 * Requires all nodes (requireAllNodes: true) to separate chat vs doc sources.
 */
const detectUndocumented: DetectorFn = async (
  nodes: KnowledgeNode[],
  _edges: KnowledgeEdge[],
  _llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];

  const chatNodes = nodes.filter(
    (n) => CHAT_SOURCE_TYPES.has(n.content.source?.sourceType ?? ''),
  );
  const docNodes = nodes.filter(
    (n) => DOC_SOURCE_TYPES.has(n.content.source?.sourceType ?? ''),
  );

  const clusters = buildClusters(chatNodes);

  for (const cluster of clusters) {
    const clusterSignal = buildSignal(cluster.topic, cluster.facts);

    const hasDoc = docNodes.some((doc) => {
      const docSignal = buildSignal(doc.title, doc.content.facts ?? []);
      const shared = sharedTokens(
        clusterSignal.titleTokens,
        docSignal.titleTokens,
      ).length;
      const lexical = lexicalScore(clusterSignal.tokens, docSignal.tokens);
      return shared >= 2 || (shared >= 1 && lexical >= 0.28);
    });

    if (hasDoc) continue;

    const mentions = cluster.nodeIds.length;
    detections.push({
      type: 'undocumented',
      severity: mentions >= 6 ? 'warning' : 'info',
      nodeIds: cluster.nodeIds.slice(0, 10),
      description:
        `Discussed ${mentions} times in chat with no documentation. ` +
        `Key points: ${cluster.facts.slice(0, 5).join('; ')}`,
      suggestedAction:
        `Create a document covering: ${cluster.facts.slice(0, 5).join('; ')}`,
    });
  }

  return detections;
};

detectUndocumented.preFilter = {
  similarityThreshold: 0,
  topK: 0,
  requireAllNodes: true,
};

export { detectUndocumented };

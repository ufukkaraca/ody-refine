/**
 * Bridge between consultant analysis engine and Detection pipeline.
 * Converts KnowledgeNode[] → AnalysisInput and ConsultingFinding[] → Detection[].
 * @module detect/consultant-bridge
 */
import type { KnowledgeNode, Detection, DetectionType } from '@useody/platform-core';
import type { ConsultingFinding, FindingCategory, AnalysisInput } from '@useody/detectors';

/** Map 7 consultant categories to 5 pipeline DetectionTypes. */
const CATEGORY_TO_TYPE: Record<FindingCategory, DetectionType> = {
  contradiction: 'contradiction',
  stale_commitment: 'staleness',
  ownership_gap: 'undocumented',
  tribal_knowledge: 'time_bomb',
  duplicate_truth: 'duplicate',
  commitment_without_followthrough: 'staleness',
  decision_without_context: 'undocumented',
};

/** Strip a path to just its filename. */
function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** Convert ingested knowledge nodes into AnalysisInput for the consultant engine. */
export function nodesToAnalysisInput(nodes: KnowledgeNode[]): AnalysisInput {
  return {
    documents: nodes.map((n) => {
      const source = n.content.source;
      const lastMod = source?.lastModified;
      return {
        path: basename(source?.sourceId ?? n.id),
        title: n.title,
        content: n.content.raw ?? n.content.summary,
        lastModified: lastMod ? lastMod.toISOString().split('T')[0] : undefined,
      };
    }),
  };
}

/** Build a description string from a consulting finding. */
function buildDescription(f: ConsultingFinding): string {
  const parts = [f.headline];
  if (f.businessImpact) parts.push(f.businessImpact);
  return parts.join(' — ');
}

/** Resolve nodeIds from affected documents by matching against known nodes. */
function resolveNodeIds(
  affected: string[],
  pathToNodeId: Map<string, string>,
): string[] {
  const ids: string[] = [];
  for (const path of affected) {
    const id = pathToNodeId.get(path);
    if (id) ids.push(id);
  }
  return ids;
}

/** Node context for the report renderer — carries source paths. */
interface NodeContext {
  id: string;
  title: string;
  source: string | null;
  excerpt: string;
}

/** Build node context objects from affected paths and evidence sources. */
function buildNodeContexts(
  f: ConsultingFinding,
  nodeMap: Map<string, KnowledgeNode>,
  pathToNodeId: Map<string, string>,
): NodeContext[] {
  // Collect all referenced paths (affectedDocuments + evidence sources)
  const seenIds = new Set<string>();
  const contexts: NodeContext[] = [];

  const addPath = (path: string): void => {
    const nodeId = pathToNodeId.get(path);
    if (!nodeId || seenIds.has(nodeId)) return;
    seenIds.add(nodeId);
    const node = nodeMap.get(nodeId);
    contexts.push({
      id: nodeId,
      title: node?.title ?? basename(path),
      source: basename(path),
      excerpt: '',
    });
  };

  // Evidence sources first (preserves order for claim A / claim B)
  for (const e of f.evidence) addPath(e.source);
  for (const path of f.affectedDocuments) addPath(path);
  return contexts;
}

/** Convert consultant findings into Detection[] for pipeline compatibility. */
export function findingsToDetections(
  findings: ConsultingFinding[],
  nodes: KnowledgeNode[],
): Detection[] {
  const pathToNodeId = new Map<string, string>();
  const nodeMap = new Map<string, KnowledgeNode>();
  for (const n of nodes) {
    const path = n.content.source?.sourceId ?? n.id;
    pathToNodeId.set(path, n.id);
    // Also map basename so findings with stripped paths resolve correctly
    const base = basename(path);
    if (!pathToNodeId.has(base)) pathToNodeId.set(base, n.id);
    nodeMap.set(n.id, n);
  }

  return findings.map((f) => {
    const nodeIds = resolveNodeIds(f.affectedDocuments, pathToNodeId);
    // Fall back to evidence sources if affectedDocuments didn't resolve
    if (nodeIds.length === 0) {
      for (const e of f.evidence) {
        const id = pathToNodeId.get(e.source);
        if (id && !nodeIds.includes(id)) nodeIds.push(id);
      }
    }

    const nodeContexts = buildNodeContexts(f, nodeMap, pathToNodeId);

    return {
      type: CATEGORY_TO_TYPE[f.category],
      severity: f.severity,
      nodeIds,
      description: buildDescription(f),
      suggestedAction: f.recommendation || undefined,
      metadata: {
        consultantCategory: f.category,
        effort: f.effort,
        evidence: f.evidence,
        impact: f.businessImpact,
        topic: f.headline,
        // Evidence claims for the report's side-by-side comparison
        claimA: f.evidence[0]?.quote,
        claimB: f.evidence[1]?.quote,
        // Node contexts with source paths for the report renderer
        nodes: nodeContexts,
      },
    };
  });
}

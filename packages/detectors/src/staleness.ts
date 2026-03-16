/**
 * Staleness detector.
 * Finds knowledge nodes superseded by newer nodes or with stale date references.
 * @module staleness
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';

const LAST_UPDATED_PATTERN =
  /\b(?:last\s+updated|updated|modified)\s*:?\s*((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|\d{4}-\d{2}(?:-\d{2})?)\b/gi;

const AS_OF_PATTERN =
  /\bas\s+of\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|\d{4}-\d{2}(?:-\d{2})?)\b/gi;

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

/** Parse a date string like "January 2025" or "2025-01" into a Date. */
function parseDateRef(ref: string): Date | null {
  const isoMatch = ref.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1]!, 10);
    const m = parseInt(isoMatch[2]!, 10) - 1;
    const d = isoMatch[3] ? parseInt(isoMatch[3], 10) : 1;
    return new Date(y, m, d);
  }
  const monthMatch = ref.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})$/i);
  if (monthMatch) {
    const m = MONTH_MAP[monthMatch[1]!.toLowerCase()]!;
    const y = parseInt(monthMatch[2]!, 10);
    return new Date(y, m, 1);
  }
  return null;
}

/** Extract referenced dates from content. */
function extractContentDates(text: string): { label: string; date: Date }[] {
  const results: { label: string; date: Date }[] = [];

  for (const pattern of [LAST_UPDATED_PATTERN, AS_OF_PATTERN]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const parsed = parseDateRef(m[1]!);
      if (parsed) results.push({ label: m[0], date: parsed });
    }
  }
  return results;
}

/**
 * Detect stale knowledge nodes.
 * Uses supersedes edges and date-based content heuristics.
 */
const detectStaleness: DetectorFn = async (
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  _llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  const now = new Date();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Edge-based detection (existing)
  const supersedesEdges = edges.filter((e) => e.type === 'supersedes');
  for (const edge of supersedesEdges) {
    const newer = nodeMap.get(edge.sourceId);
    const older = nodeMap.get(edge.targetId);
    if (!newer || !older) continue;

    const edgeCreated = edge.createdAt ?? new Date(0);
    const olderLastModified =
      older.content.source?.lastModified ?? older.updatedAt;

    if (olderLastModified >= edgeCreated) continue;

    const olderFile = older.content.source?.sourceId?.split('/').pop() ?? older.title;
    const newerFile = newer.content.source?.sourceId?.split('/').pop() ?? newer.title;
    detections.push({
      type: 'staleness',
      severity: 'warning',
      nodeIds: [older.id, newer.id],
      description: `"${older.title}" may be outdated — a newer version exists in "${newer.title}".`,
      suggestedAction: `Review ${olderFile} and update it to match ${newerFile}, or mark it as superseded.`,
      metadata: {
        claimA: `Older: ${older.title} (${olderFile})`,
        claimB: `Newer: ${newer.title} (${newerFile})`,
        topic: 'version drift',
      },
    });
  }

  // Date-based heuristic: content referencing old dates
  const superseededIds = new Set(
    supersedesEdges.map((e) => e.targetId),
  );

  for (const node of nodes) {
    if (superseededIds.has(node.id)) continue; // already caught above

    const raw = node.content.raw ?? '';
    const text = `${node.title} ${node.content.summary} ${raw}`;
    const refs = extractContentDates(text);

    for (const ref of refs) {
      const age = now.getTime() - ref.date.getTime();
      if (age > SIX_MONTHS_MS) {
        const monthsOld = Math.round(age / (30 * 24 * 60 * 60 * 1000));
        const nodeFile = node.content.source?.sourceId?.split('/').pop() ?? node.title;
        detections.push({
          type: 'staleness',
          severity: 'info',
          nodeIds: [node.id],
          description: `"${node.title}" references "${ref.label}" (${monthsOld} months ago) — content may be outdated.`,
          suggestedAction: `Review ${nodeFile} and verify the information is still current.`,
        });
        break; // one detection per node
      }
    }
  }

  return detections;
};

detectStaleness.preFilter = {
  similarityThreshold: 0.5,
  topK: 15,
};

export { detectStaleness, extractContentDates, parseDateRef, SIX_MONTHS_MS };

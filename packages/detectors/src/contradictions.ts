/**
 * Contradiction detector.
 * Finds knowledge nodes that contradict each other via edges, facts, or content.
 * @module contradictions
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';

const NUMBER_UNIT_PATTERN =
  /(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(requests?|per|min|minutes?|hour|hours?|day|days?|month|months?|week|weeks?|\/\w+|calls?|users?|people|persons?|employees?|members?|%|percent|gpus?|nodes?|cores?|GBs?|instances?|seconds?|tokens?)/gi;

const BOOLEAN_PAIRS: [RegExp, RegExp, string, string][] = [
  [/\bremote[- ]first\b/i, /\b(?:in[- ]office|office[- ](?:first|required|days?)|monday|tuesday|wednesday|thursday|friday)\b/i,
    'remote-first', 'office requirement'],
  [/\brequired\b/i, /\boptional\b/i, 'required', 'optional'],
  [/\bmandatory\b/i, /\bnot\s+required\b/i, 'mandatory', 'not required'],
  [/\bdeprecated\b/i, /\bcurrent(?:ly)?\s+(?:supported|active|used)\b/i,
    'deprecated', 'current'],
  [/\benabled?\b/i, /\bdisabled?\b/i, 'enabled', 'disabled'],
  [/\bunder\s+a\s+minute\b/i, /\ba\s+few\s+minutes\b/i,
    'under a minute', 'a few minutes'],
  [/\bfree\b/i, /\bpaid\b/i, 'free', 'paid'],
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'not', 'with', 'from', 'by', 'into', 'it', 'its',
  'this', 'that', 'we', 'our', 'all', 'use', 'uses', 'used', 'than',
]);

interface NumberFact { value: number; unit: string; raw: string; index: number }

/** Extract number+unit pairs from text. */
function extractNumbers(text: string): NumberFact[] {
  const results: NumberFact[] = [];
  const re = new RegExp(NUMBER_UNIT_PATTERN.source, NUMBER_UNIT_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]!.replace(/,/g, ''));
    const unit = m[2]!.toLowerCase().replace(/s$/, '');
    results.push({ value, unit, raw: m[0], index: m.index });
  }
  return results;
}

/** Normalize unit names for comparison. */
function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    min: 'minute', minute: 'minute',
    hour: 'hour', day: 'day', week: 'week', month: 'month',
    request: 'request', call: 'call',
    user: 'user', people: 'person', person: 'person',
    employee: 'person', member: 'person',
  };
  return map[u] ?? u;
}

/** Get raw text from a node for content-based heuristics. */
function getNodeText(node: KnowledgeNode): string {
  const raw = node.content.raw ?? '';
  const facts = (node.content.facts ?? []).join(' ');
  return `${node.title} ${node.content.summary} ${facts} ${raw}`;
}

/** Extract keywords from text, excluding stopwords. */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Extract the sentence containing the match at matchIndex. */
function extractSentence(text: string, matchIndex: number): string {
  let start = matchIndex;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
  let end = matchIndex;
  while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
  return text.slice(start, end).trim();
}

/** Canonical pair key for deduplication. */
function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/** Build set of entities appearing in >50% of nodes (only for corpus > 4 nodes). */
function buildHighFreqEntities(nodes: KnowledgeNode[]): Set<string> {
  if (nodes.length <= 4) return new Set();
  const freq = new Map<string, number>();
  for (const node of nodes) {
    for (const ent of node.content.entities ?? []) {
      const name = ent.name.toLowerCase();
      freq.set(name, (freq.get(name) ?? 0) + 1);
    }
  }
  const threshold = nodes.length * 0.5;
  const result = new Set<string>();
  for (const [name, count] of freq) {
    if (count > threshold) result.add(name);
  }
  return result;
}

/**
 * Detect contradictions between knowledge nodes.
 * Uses edges, fact comparison, and raw content heuristics.
 */
const detectContradictions: DetectorFn = async (
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  _llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  const seenPairs = new Set<string>();
  const highFreqEntities = buildHighFreqEntities(nodes);

  const contradictEdges = edges.filter((e) => e.type === 'contradicts');
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of contradictEdges) {
    const nodeA = nodeMap.get(edge.sourceId);
    const nodeB = nodeMap.get(edge.targetId);
    if (!nodeA || !nodeB) continue;
    const key = pairKey(nodeA.id, nodeB.id);
    seenPairs.add(key);
    detections.push({
      type: 'contradiction',
      severity: edge.confidence >= 0.8 ? 'critical' : 'warning',
      nodeIds: [nodeA.id, nodeB.id],
      description: edge.reason,
      suggestedAction:
        `Resolve which is current: "${nodeA.title}" or "${nodeB.title}"`,
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const key = pairKey(a.id, b.id);
      if (seenPairs.has(key)) continue;

      const pairDets: Detection[] = [];
      detectFactContradiction(a, b, pairDets, highFreqEntities);
      if (pairDets.length === 0) detectNumberContradiction(a, b, pairDets);
      if (pairDets.length === 0) detectBooleanContradiction(a, b, pairDets);
      if (pairDets.length > 0) {
        seenPairs.add(key);
        detections.push(...pairDets);
      }
    }
  }

  return detections;
};

/** Detect contradictions from shared entities with different facts. */
function detectFactContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
  highFreqEntities: Set<string>,
): void {
  const factsA = a.content.facts ?? [];
  const factsB = b.content.facts ?? [];
  if (factsA.length === 0 || factsB.length === 0) return;

  const entA = new Set((a.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const entB = new Set((b.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const shared = [...entA].filter((e) => entB.has(e) && !highFreqEntities.has(e));
  const meaningful = shared.filter((e) => e.length > 3);
  if (meaningful.length < 2) return;

  const setA = new Set(factsA.map((f) => f.toLowerCase()));
  const setB = new Set(factsB.map((f) => f.toLowerCase()));
  if ([...setA].every((f) => setB.has(f))) return;

  const onlyA = factsA.filter((f) => !setB.has(f.toLowerCase())).slice(0, 2);
  const onlyB = factsB.filter((f) => !setA.has(f.toLowerCase())).slice(0, 2);
  if (onlyA.length === 0 && onlyB.length === 0) return;

  // Require differing facts share at least one meaningful keyword (same sub-topic)
  const kwA = extractKeywords(onlyA.join(' '));
  const kwB = extractKeywords(onlyB.join(' '));
  if (![...kwA].some((k) => kwB.has(k))) return;

  const quoteA = onlyA.length > 0 ? onlyA.join('; ') : '(no unique claims)';
  const quoteB = onlyB.length > 0 ? onlyB.join('; ') : '(no unique claims)';

  out.push({
    type: 'contradiction', severity: 'info', nodeIds: [a.id, b.id],
    description:
      `"${a.title}" says: ${quoteA} — but "${b.title}" says: ${quoteB}`,
    suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
    metadata: { sharedEntities: meaningful, factsA: onlyA, factsB: onlyB },
  });
}

/** Detect number+unit contradictions, showing surrounding sentence for context. */
function detectNumberContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
): void {
  const textA = getNodeText(a);
  const textB = getNodeText(b);
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);
  if (numsA.length === 0 || numsB.length === 0) return;

  for (const na of numsA) {
    for (const nb of numsB) {
      if (normalizeUnit(na.unit) === normalizeUnit(nb.unit) && na.value !== nb.value) {
        const sentA = extractSentence(textA, na.index);
        const sentB = extractSentence(textB, nb.index);
        out.push({
          type: 'contradiction', severity: 'warning', nodeIds: [a.id, b.id],
          description: `Possible contradiction: "${sentA}" vs "${sentB}".`,
          suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
        });
        return; // one detection per pair
      }
    }
  }
}

/** Detect boolean/opposing concept contradictions from raw content. */
function detectBooleanContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
): void {
  const textA = getNodeText(a);
  const textB = getNodeText(b);

  for (const [patternA, patternB, labelA, labelB] of BOOLEAN_PAIRS) {
    if (
      (patternA.test(textA) && patternB.test(textB)) ||
      (patternB.test(textA) && patternA.test(textB))
    ) {
      out.push({
        type: 'contradiction', severity: 'warning', nodeIds: [a.id, b.id],
        description: `Possible contradiction: "${labelA}" vs "${labelB}".`,
        suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
      });
      return; // one detection per pair
    }
  }
}

detectContradictions.preFilter = {
  similarityThreshold: 0.6,
  topK: 10,
};

export { detectContradictions, extractNumbers };

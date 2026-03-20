/**
 * Claim-based contradiction detection using Natural Language Inference.
 * Extracts atomic claims from each node, clusters by topic similarity,
 * then does pairwise NLI: "can both claims be true simultaneously?"
 * @module claim-nli
 */
import type {
  Detection,
  KnowledgeNode,
  LLMProvider,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import { completeWithTimeout } from './helpers/llm-timeout.js';

const LLM_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 5;

/** An atomic claim extracted from a knowledge node. */
interface AtomicClaim {
  text: string;
  nodeId: string;
  nodeTitle: string;
  sourceFile: string;
}

/** NLI result from comparing two claims. */
interface NliResult {
  contradiction: boolean;
  explanation: string;
  severity: 'critical' | 'warning';
}

const EXTRACT_CLAIMS_PROMPT = `Extract every specific factual assertion from this text.
Each claim must be a standalone statement that could be verified as true or false.
Focus on: numbers, policies, rules, deadlines, requirements, schedules.

IMPORTANT: Only extract claims that are ACTIVELY STATED in the text.
Do NOT invent claims about what is missing, absent, or not mentioned.
Never produce claims like "No X specified" or "X is not mentioned."

Return JSON only: {"claims":["claim1","claim2",...]}

Examples:
- "Employees can work remotely up to 3 days per week"
- "All PRs require 2 reviewer approvals"
- "On-call response time is 15 minutes"
- "Annual vacation allowance is 20 days"
- "Deployments happen on Tuesdays at 2 PM UTC"

Text:
`;

const NLI_PROMPT = `Check if two claims from different documents contradict each other.
Contradiction = BOTH claims make ACTIVE assertions about the SAME topic that CANNOT both be true.

CRITICAL: Absence is NOT contradiction. If only one claim addresses a topic, that is a gap, not a conflict.
Both claims must actively disagree on the same specific thing.

NOT contradictions: different topics, complementary info, one-sided coverage.
REAL contradictions: "rate limit 1000/min" vs "rate limit 500/min"; "remote-first" vs "office full-time".

Claim A: "{claimA}" (Source: {sourceA})
Claim B: "{claimB}" (Source: {sourceB})

When in doubt, answer false. Reply ONLY valid JSON:
{"contradiction":true/false,"explanation":"why they conflict or don't","severity":"critical|warning"}`;

/**
 * Extract atomic claims from a node's content using LLM.
 * Returns precise, verifiable factual assertions.
 */
async function extractAtomicClaims(
  node: KnowledgeNode,
  llm: LLMProvider,
): Promise<AtomicClaim[]> {
  const text = node.content.raw ?? node.content.summary;
  const response = await completeWithTimeout(
    llm,
    [{ role: 'user', content: EXTRACT_CLAIMS_PROMPT + text }],
    { temperature: 0, maxTokens: 1024 },
    LLM_TIMEOUT_MS,
  );
  if (!response) return [];

  const parsed = parseLlmJsonResponse<{ claims: string[] }>(response);
  if (!parsed.data?.claims || !Array.isArray(parsed.data.claims)) return [];

  const sourceFile = node.content.source?.sourceId ?? '';
  return parsed.data.claims
    .filter((c): c is string => typeof c === 'string' && c.length > 10)
    .map((text) => ({
      text,
      nodeId: node.id,
      nodeTitle: node.title,
      sourceFile,
    }));
}

/**
 * Compare two claims using NLI framing.
 * Returns whether they contradict and why.
 */
async function compareClaims(
  a: AtomicClaim,
  b: AtomicClaim,
  llm: LLMProvider,
): Promise<NliResult | null> {
  const prompt = NLI_PROMPT
    .replace('{claimA}', a.text)
    .replace('{sourceA}', a.nodeTitle)
    .replace('{claimB}', b.text)
    .replace('{sourceB}', b.nodeTitle);

  const response = await completeWithTimeout(
    llm,
    [{ role: 'user', content: prompt }],
    { temperature: 0, maxTokens: 200 },
    LLM_TIMEOUT_MS,
  );
  if (!response) return null;

  const parsed = parseLlmJsonResponse<NliResult>(response);
  return parsed.data ?? null;
}

/**
 * Find claims about the same topic using keyword overlap.
 * Returns pairs of claims from DIFFERENT source files.
 */
function findRelatedClaimPairs(
  claims: AtomicClaim[],
): Array<[AtomicClaim, AtomicClaim]> {
  const pairs: Array<[AtomicClaim, AtomicClaim]> = [];
  const STOP = new Set([
    'the', 'and', 'for', 'are', 'with', 'per', 'our', 'all', 'must',
    'can', 'may', 'will', 'from', 'that', 'this', 'have', 'each',
    'not', 'but', 'should', 'any', 'been',
  ]);

  /** Basic stemming: remove trailing s/es/ed/ing for better matching. */
  const stem = (w: string): string => {
    if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
    return w;
  };

  const keywordCache = new Map<number, Set<string>>();
  const getKw = (idx: number): Set<string> => {
    if (keywordCache.has(idx)) return keywordCache.get(idx)!;
    const kw = new Set(
      claims[idx]!.text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
        .map(stem),
    );
    keywordCache.set(idx, kw);
    return kw;
  };

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      // Only compare claims from DIFFERENT source files
      if (a.sourceFile === b.sourceFile) continue;
      // Check keyword overlap — at least 1 meaningful shared word
      const kwA = getKw(i);
      const kwB = getKw(j);
      const shared = [...kwA].filter((w) => kwB.has(w));
      if (shared.length >= 1) {
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}

/**
 * Run claim-based NLI contradiction detection.
 * Stage 1: Extract atomic claims from each node.
 * Stage 2: Find related claim pairs (same topic, different sources).
 * Stage 3: Compare each pair via LLM NLI.
 */
export async function detectClaimNliContradictions(
  nodes: KnowledgeNode[],
  llm: LLMProvider,
  out: Detection[],
  seen: Set<string>,
): Promise<void> {
  // Stage 1: Extract atomic claims from all nodes
  const allClaims: AtomicClaim[] = [];
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((n) => extractAtomicClaims(n, llm)),
    );
    for (const claims of results) {
      allClaims.push(...claims);
    }
  }

  if (allClaims.length < 2) return;

  // Stage 2: Find related claim pairs
  const pairs = findRelatedClaimPairs(allClaims);

  // Cap at 100 LLM calls for NLI comparison
  const MAX_NLI_CALLS = 100;
  const pairsToCheck = pairs.slice(0, MAX_NLI_CALLS);

  // Stage 3: NLI comparison
  for (let i = 0; i < pairsToCheck.length; i += BATCH_SIZE) {
    const batch = pairsToCheck.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(([a, b]) => compareClaims(a, b, llm)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const [claimA, claimB] = batch[j]!;
      if (!result?.contradiction) continue;

      const key = [claimA.nodeId, claimB.nodeId].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        type: 'contradiction',
        severity: result.severity,
        nodeIds: [claimA.nodeId, claimB.nodeId],
        description: `${claimA.nodeTitle} states: "${claimA.text}" — but ${claimB.nodeTitle} states: "${claimB.text}"`,
        suggestedAction: `Review and align: "${claimA.text}" vs "${claimB.text}"`,
        metadata: {
          claimA: claimA.text,
          claimB: claimB.text,
          explanation: result.explanation,
          topic: `${claimA.nodeTitle} vs ${claimB.nodeTitle}`,
        },
      });
    }
  }
}

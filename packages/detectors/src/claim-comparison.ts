/**
 * LLM-based claim contradiction detection.
 * Compares extracted facts between knowledge nodes using an LLM.
 * @module claim-comparison
 */
import type {
  ChatMessage,
  Detection,
  KnowledgeNode,
  LLMProvider,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import { completeWithTimeout } from './helpers/llm-timeout.js';

const MAX_LLM_CALLS = 30;
const LLM_TIMEOUT_MS = 8_000;

interface ClaimResult {
  isContradiction: boolean;
  topic: string;
  claimA: string;
  claimB: string;
  severity: 'critical' | 'warning';
  explanation: string;
}

/** Build the system prompt for claim comparison. */
function buildSystemPrompt(): string {
  return [
    'You compare knowledge claims for REAL contradictions. Be STRICT.',
    '',
    'A contradiction means: BOTH documents make ACTIVE, EXPLICIT claims',
    'about the SAME specific thing, but state INCOMPATIBLE facts.',
    '',
    'CRITICAL — Absence is NOT contradiction:',
    'If Doc A states something and Doc B is SILENT about that topic,',
    'that is a gap, NOT a contradiction. The undocumented detector handles gaps.',
    'Both documents must make active assertions that conflict.',
    '',
    'FALSE POSITIVES to avoid (absence-based):',
    '- "Doc A requires Vitest" vs "Doc B doesn\'t mention a test framework" → NOT a contradiction',
    '- "Doc A has a 250-line limit" vs "Doc B has no line limit rule" → NOT a contradiction',
    '- "Doc A says be kind" vs "Doc B has no kindness requirement" → NOT a contradiction',
    '',
    'NOT a contradiction (different topics):',
    '- Different pages covering different aspects of a topic',
    '- Complementary information (overview vs details)',
    '- Different resources (CPU vs GPU, memory vs storage)',
    '- General vs specific descriptions of the same thing',
    '',
    'IS a contradiction (both docs actively conflict):',
    '- "API rate limit is 1000/min" vs "API rate limit is 500/min" → REAL conflict',
    '- "Deploy window Tue-Thu" vs "Deploy Friday 2-4pm" → REAL conflict',
    '- "Remote-first" vs "Must work from office full-time" → REAL conflict',
    '',
    'When in doubt: NOT a contradiction. Be conservative.',
    '',
    'Reply ONLY valid JSON:',
    '{"isContradiction":bool,"topic":"the specific thing both discuss",',
    '"claimA":"what A says","claimB":"what B says",',
    '"severity":"critical|warning","explanation":"one sentence"}',
  ].join('\n');
}

/** Build the user prompt for a specific fact pair. */
function buildUserPrompt(
  nodeA: KnowledgeNode,
  nodeB: KnowledgeNode,
  factsA: string,
  factsB: string,
): string {
  return [
    `Claims from "${nodeA.title}":`,
    factsA,
    '',
    `Claims from "${nodeB.title}":`,
    factsB,
    '',
    'Are any of these claims about the SAME topic but contradictory?',
  ].join('\n');
}

/** Canonical pair key for deduplication. */
function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/**
 * Detect contradictions by sending extracted facts to an LLM for comparison.
 * Only processes nodes that have extracted facts.
 */
export async function detectClaimContradictions(
  nodes: KnowledgeNode[],
  llm: LLMProvider,
  out: Detection[],
  seen: Set<string>,
): Promise<void> {
  const nodesWithFacts = nodes.filter(
    (n) => (n.content.facts?.length ?? 0) > 0,
  );
  if (nodesWithFacts.length < 2) return;

  let callCount = 0;
  const systemMsg = buildSystemPrompt();

  for (let i = 0; i < nodesWithFacts.length && callCount < MAX_LLM_CALLS; i++) {
    for (let j = i + 1; j < nodesWithFacts.length && callCount < MAX_LLM_CALLS; j++) {
      const a = nodesWithFacts[i]!;
      const b = nodesWithFacts[j]!;
      const key = pairKey(a.id, b.id);
      if (seen.has(key)) continue;

      const factsA = a.content.facts!.join('\n');
      const factsB = b.content.facts!.join('\n');

      const messages: ChatMessage[] = [
        { role: 'system', content: systemMsg },
        { role: 'user', content: buildUserPrompt(a, b, factsA, factsB) },
      ];

      const response = await completeWithTimeout(
        llm,
        messages,
        { temperature: 0, maxTokens: 300 },
        LLM_TIMEOUT_MS,
      );
      callCount++;

      if (!response) continue;

      const parsed = parseLlmJsonResponse<ClaimResult>(response);
      if (!parsed.data?.isContradiction) continue;

      const result = parsed.data;
      const severity = result.severity === 'critical' ? 'critical' : 'warning';

      seen.add(key);
      out.push({
        type: 'contradiction',
        severity,
        nodeIds: [a.id, b.id],
        description: `When discussing ${result.topic}, ${a.title} states: '${result.claimA}'. However, ${b.title} states: '${result.claimB}'.`,
        suggestedAction: `Review and align ${a.title} and ${b.title} on ${result.topic}.`,
        metadata: {
          claimA: result.claimA,
          claimB: result.claimB,
          topic: result.topic,
          impact: result.explanation,
          confidence: severity === 'critical' ? 'high' : 'medium',
        },
      });
    }
  }
}

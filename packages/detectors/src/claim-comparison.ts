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
    'You compare two sets of knowledge claims for contradictions.',
    '',
    'Rules:',
    '- Different topics = not a contradiction (CPU pricing vs memory pricing)',
    '- Same topic, same info = agreement, not contradiction',
    '- Same topic, different info = CONTRADICTION',
    '- Numbers about the same thing but different values = CONTRADICTION',
    '- Opposing policies about the same thing = CONTRADICTION',
    '',
    'Reply with ONLY valid JSON (no markdown, no explanation outside JSON):',
    '{"isContradiction": bool, "topic": "what both discuss",',
    ' "claimA": "what A says", "claimB": "what B says",',
    ' "severity": "critical|warning", "explanation": "one sentence"}',
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
        { temperature: 0.1, maxTokens: 300 },
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

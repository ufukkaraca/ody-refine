/**
 * Duplicate / split-truth detector.
 * Finds knowledge nodes covering the same topic with different information.
 * @module duplicates
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import { completeWithTimeout } from './helpers/llm-timeout.js';
import { tokenize, sharedTokens } from './helpers/text-utils.js';

/** Minimum shared tokens between two nodes to consider them topically related. */
const MIN_SHARED_TOKENS = 1;

/** Build a canonical pair key for deduplication. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Extract fact tokens from a node for overlap checking. */
function factTokens(node: KnowledgeNode): string[] {
  const facts = node.content.facts ?? [];
  return tokenize(`${node.title} ${facts.join(' ')}`);
}

/**
 * Detect split truth between knowledge nodes using LLM analysis.
 * Pre-filters by fact overlap before sending to LLM.
 * Returns empty if no LLM is provided.
 */
const detectDuplicates: DetectorFn = async (
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  if (!llm) return detections;

  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;

      const key = pairKey(a.id, b.id);
      if (seen.has(key)) continue;
      seen.add(key);

      const hasEdge = edges.some(
        (e) =>
          (e.sourceId === a.id && e.targetId === b.id) ||
          (e.sourceId === b.id && e.targetId === a.id),
      );
      if (hasEdge) continue;

      const factsA = (a.content.facts ?? []).join('\n- ');
      const factsB = (b.content.facts ?? []).join('\n- ');
      if (!factsA && !factsB) continue;

      const tokensA = factTokens(a);
      const tokensB = factTokens(b);
      const overlap = sharedTokens(tokensA, tokensB);
      if (overlap.length < MIN_SHARED_TOKENS) continue;

      const response = await completeWithTimeout(
        llm,
        [
          {
            role: 'system',
            content: [
              'You detect SPLIT TRUTH: two documents about the SAME specific topic',
              'that state DIFFERENT or CONFLICTING facts.',
              'Rules:',
              '- Two documents about DIFFERENT topics = NOT split truth.',
              '- Two documents that AGREE on the same topic = NOT split truth.',
              '- Only flag when the SAME topic has CONFLICTING specific claims.',
              'Reply JSON only: {"splitTruth":boolean,"conflictA":string,"conflictB":string,"explanation":string}',
              'conflictA/B: the specific conflicting claim from each document (under 20 words each).',
              'If not split truth, set conflictA and conflictB to empty strings.',
              'Keep explanation under 25 words.',
            ].join(' '),
          },
          {
            role: 'user',
            content:
              `Document A: "${a.title}"\nFacts:\n- ${factsA || '(none)'}` +
              `\n\nDocument B: "${b.title}"\nFacts:\n- ${factsB || '(none)'}`,
          },
        ],
        { temperature: 0.1, maxTokens: 200 },
      );

      if (!response) continue;

      const parsed = parseLlmJsonResponse<{
        splitTruth: boolean;
        conflictA?: string;
        conflictB?: string;
        explanation: string;
      }>(response);

      if (parsed.data?.splitTruth && parsed.data.explanation) {
        const desc =
          parsed.data.conflictA && parsed.data.conflictB
            ? `Split truth: "${parsed.data.conflictA}" vs "${parsed.data.conflictB}"`
            : parsed.data.explanation;

        detections.push({
          type: 'duplicate',
          severity: 'warning',
          nodeIds: [a.id, b.id],
          description: desc,
          suggestedAction:
            'Review and consolidate into a single source of truth.',
        });
      }
    }
  }

  return detections;
};

detectDuplicates.preFilter = {
  similarityThreshold: 0.75,
  topK: 5,
};

export { detectDuplicates };

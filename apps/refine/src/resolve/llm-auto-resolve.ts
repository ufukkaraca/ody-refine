/**
 * LLM-powered auto-resolve for contradictions.
 * Uses the configured LLM to pick the correct claim.
 * @module resolve/llm-auto-resolve
 */
import type {
  Detection,
  LLMProvider,
  PreferencePair,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import type { NodeInfo, InteractiveResolution } from './resolve-interactive.js';
import { generatePrompt } from './resolve-interactive.js';

/** Result shape we expect from the LLM. */
interface LlmPickResult {
  pick: 'A' | 'B';
  reasoning: string;
  confidence: number;
}

/** Build the prompt for the LLM to pick the correct claim. */
function buildPickPrompt(
  detection: Detection,
  nodeA: NodeInfo,
  nodeB: NodeInfo,
): string {
  return `You are a document accuracy reviewer. Two sources contradict each other.

Detection: ${detection.description}

Source A — "${nodeA.title}":
${nodeA.raw.slice(0, 600)}

Source B — "${nodeB.title}":
${nodeB.raw.slice(0, 600)}

Which source is more likely correct? Consider:
- Recency (newer docs usually override older)
- Specificity (detailed > vague)
- Authority (official handbook > informal notes)

Respond with JSON only:
{"pick": "A" or "B", "reasoning": "one sentence", "confidence": 0.0 to 1.0}`;
}

/** Extract a relevant snippet from raw text. */
function snippet(raw: string, maxLen = 500): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

/**
 * Auto-resolve contradictions using an LLM.
 * Non-contradiction detections are returned as skipped.
 * If LLM fails for a detection, it is skipped.
 */
export async function llmAutoResolve(
  detections: Detection[],
  nodeLookup: Map<string, NodeInfo>,
  llm: LLMProvider,
  logger?: (msg: string) => void,
): Promise<InteractiveResolution[]> {
  const log = logger ?? ((): void => {});
  const results: InteractiveResolution[] = [];

  for (const d of detections) {
    const isContradiction =
      d.type === 'contradiction' && d.nodeIds.length >= 2;

    if (!isContradiction) {
      results.push({ detection: d, action: 'skip' });
      continue;
    }

    const nodeA = nodeLookup.get(d.nodeIds[0]!);
    const nodeB = nodeLookup.get(d.nodeIds[1]!);

    if (!nodeA || !nodeB) {
      log(`  Skipping: missing node data for ${d.description}`);
      results.push({ detection: d, action: 'skip' });
      continue;
    }

    try {
      const prompt = buildPickPrompt(d, nodeA, nodeB);
      const response = await llm.complete(
        [
          { role: 'system', content: 'You are a document accuracy reviewer. Respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0, maxTokens: 200 },
      );

      const parsed = parseLlmJsonResponse<LlmPickResult>(response);

      if (!parsed.data || !['A', 'B'].includes(parsed.data.pick)) {
        log(`  LLM returned invalid pick for: ${d.description}`);
        results.push({ detection: d, action: 'skip' });
        continue;
      }

      const { pick, reasoning, confidence } = parsed.data;
      const chosenNode = pick === 'A' ? nodeA : nodeB;
      const rejectedNode = pick === 'A' ? nodeB : nodeA;

      const pair: PreferencePair = {
        prompt: generatePrompt(d),
        chosen: snippet(chosenNode.raw),
        rejected: snippet(rejectedNode.raw),
        metadata: {
          conflictType: d.type,
          resolvedBy: `auto:${llm.getModelId()}`,
          resolvedAt: new Date(),
          confidence: Math.min(1, Math.max(0, confidence ?? 0.7)),
          sourceNodeIds: d.nodeIds,
        },
      };

      log(`  Auto-resolved: ${d.description} -> ${pick} (${reasoning})`);
      results.push({ detection: d, action: 'resolve', pair });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  LLM error for ${d.description}: ${msg}`);
      results.push({ detection: d, action: 'skip' });
    }
  }

  return results;
}

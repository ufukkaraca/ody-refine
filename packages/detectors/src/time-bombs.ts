/**
 * Time bomb detector.
 * Finds date-dependent commitments that have expired or will expire soon.
 * @module time-bombs
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
import {
  DATE_PATTERN,
  extractDeadlines,
  classifyDeadline,
  findCompletionNode,
} from './time-bomb-utils.js';

/**
 * Detect date-dependent commitments that may have expired.
 * Parses dates without LLM; uses LLM for richer analysis when available.
 */
const detectTimeBombs: DetectorFn = async (
  nodes: KnowledgeNode[],
  _edges: KnowledgeEdge[],
  llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  const now = new Date();
  const nowLabel = now.toISOString().split('T')[0]!;

  for (const node of nodes) {
    const facts = node.content.facts ?? [];
    const raw = node.content.raw ?? '';
    const text = `${node.title} ${facts.join(' ')} ${node.content.summary} ${raw}`;

    if (!DATE_PATTERN.test(text)) continue;

    if (!llm) {
      const deadlines = extractDeadlines(text, now);
      if (deadlines.length === 0) continue;
      const nodeDocType = (node.metadata?.['docType'] as string) ?? undefined;
      for (const dl of deadlines) {
        const det = classifyDeadline(dl, now, node.id, nowLabel, nodeDocType);
        if (det) detections.push(det);
      }
      continue;
    }

    const response = await completeWithTimeout(
      llm,
      [
        {
          role: 'system',
          content: [
            'You analyze text for date-dependent commitments.',
            `Today is ${nowLabel}.`,
            'Return JSON: {"hasTimeBomb":boolean,"deadline":string|null,',
            '"expired":boolean,"description":string}',
            'Keep description under 30 words.',
          ].join(' '),
        },
        { role: 'user', content: `Text: "${text.slice(0, 1000)}"` },
      ],
      { temperature: 0, maxTokens: 150 },
    );

    if (!response) continue;

    const parsed = parseLlmJsonResponse<{
      hasTimeBomb: boolean;
      deadline: string | null;
      expired: boolean;
      description: string;
    }>(response);

    if (parsed.data?.hasTimeBomb) {
      detections.push({
        type: 'time_bomb',
        severity: parsed.data.expired ? 'critical' : 'warning',
        nodeIds: [node.id],
        description: parsed.data.description,
        suggestedAction: parsed.data.expired
          ? `Deadline "${parsed.data.deadline}" has passed. Update or remove.`
          : `Deadline "${parsed.data.deadline}" approaching. Verify status.`,
        metadata: {
          deadline: parsed.data.deadline,
          expired: parsed.data.expired,
        },
      });
    }
  }

  // Deduplicate: group by deadline label, merge nodeIds
  const byDeadline = new Map<string, Detection>();
  for (const det of detections) {
    const key = (det.metadata?.['deadline'] as string) ?? det.description;
    const existing = byDeadline.get(key);
    if (existing) {
      const merged = [...new Set([...existing.nodeIds, ...det.nodeIds])];
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      const bestSev = sevOrder[det.severity] < sevOrder[existing.severity] ? det.severity : existing.severity;
      byDeadline.set(key, {
        ...existing,
        severity: bestSev,
        nodeIds: merged,
        description: merged.length > 1
          ? `${existing.description.replace(/\s*\(\d+ documents?\)$/g, '')} (${String(merged.length)} documents)`
          : existing.description,
      });
    } else {
      byDeadline.set(key, det);
    }
  }
  const deduped = [...byDeadline.values()];

  const MAX_TIME_BOMBS = 20;
  const capped = deduped.slice(0, MAX_TIME_BOMBS);

  return capped.map((det) => {
    if (det.metadata?.expired !== true) return det;
    const nodeId = det.nodeIds[0];
    if (!nodeId) return det;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return det;
    const nodeText = `${node.title} ${(node.content.facts ?? []).join(' ')} ${node.content.summary}`;
    const completionTitle = findCompletionNode(nodeId, nodeText, nodes);
    if (!completionTitle) return det;
    return {
      ...det,
      severity: 'info' as const,
      description: `Deadline passed but may have been completed — see '${completionTitle}'`,
    };
  });
};

detectTimeBombs.preFilter = {
  similarityThreshold: 0,
  topK: 0,
  requireAllNodes: true,
};

export { detectTimeBombs, extractDeadlines, classifyDeadline };

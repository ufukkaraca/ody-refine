/**
 * TRL format adapters for training data export.
 * Converts knowledge nodes and preference pairs to HuggingFace TRL-compatible formats.
 * @module export/trl-adapter
 */

import type { KnowledgeNode, PreferencePair } from '@useody/platform-core';

/** Options for SFT JSONL export. */
export interface SftExportOptions {
  /** Minimum confidence score to include a node. Defaults to 0. */
  filterByConfidence?: number;
  /**
   * Prefix used to form the instruction question.
   * Defaults to "Summarize the following topic:".
   */
  instructionPrefix?: string;
}

/**
 * TRL DPO record — matches HuggingFace TRL DPOTrainer expected format.
 * Omits internal metadata fields that TRL does not recognize.
 */
export interface TrlDpoRecord {
  prompt: string;
  chosen: string;
  rejected: string;
}

/** TRL SFT record — instruction/response pair for supervised fine-tuning. */
export interface TrlSftRecord {
  instruction: string;
  response: string;
}

/**
 * Export preference pairs to TRL DPO-compatible JSONL.
 * Strips internal metadata — TRL's DPOTrainer expects only prompt/chosen/rejected.
 * Format per line: {"prompt": "...", "chosen": "...", "rejected": "..."}
 */
export function exportTrlDpoToJsonl(pairs: PreferencePair[]): string {
  if (pairs.length === 0) return '';
  return pairs
    .map(
      (p): TrlDpoRecord => ({
        prompt: p.prompt,
        chosen: p.chosen,
        rejected: p.rejected,
      }),
    )
    .map((r) => JSON.stringify(r))
    .join('\n');
}

/**
 * Export knowledge nodes to SFT instruction/response JSONL.
 * Converts each node's summary + facts into an instruction/response training pair.
 * Format per line: {"instruction": "...", "response": "..."}
 * Skips nodes with empty summaries.
 */
export function exportSftToJsonl(
  nodes: KnowledgeNode[],
  options?: SftExportOptions,
): string {
  if (nodes.length === 0) return '';
  const minConfidence = options?.filterByConfidence ?? 0;
  const prefix =
    options?.instructionPrefix ?? 'Summarize the following topic:';

  const filtered = nodes.filter(
    (n) => n.confidence >= minConfidence && n.content.summary.trim().length > 0,
  );
  if (filtered.length === 0) return '';

  return filtered
    .map((node): TrlSftRecord => {
      const facts = node.content.facts ?? [];
      const response =
        facts.length > 0
          ? `${node.content.summary} ${facts.join(' ')}`
          : node.content.summary;
      return {
        instruction: `${prefix} ${node.title}`,
        response,
      };
    })
    .map((r) => JSON.stringify(r))
    .join('\n');
}

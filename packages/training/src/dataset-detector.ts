/**
 * Auto-detect dataset type from a Refine JSONL export.
 * Reads the file and classifies entries as DPO pairs, SFT nodes, or mixed.
 * @module training/dataset-detector
 */

import { readFile } from 'node:fs/promises';

/** Detected dataset type based on JSONL content. */
export type DetectedDatasetType = 'dpo' | 'sft' | 'mixed';

/** Required fields for a DPO preference pair entry. */
const DPO_FIELDS = ['prompt', 'chosen', 'rejected'] as const;

/** Required fields for a Refine knowledge node entry. */
const NODE_FIELDS = ['id', 'title', 'content', 'confidence'] as const;

/** Required fields for an SFT instruction/response entry. */
const SFT_FIELDS = ['instruction', 'response'] as const;

/** Detail about a single invalid line. */
export interface InvalidLineDetail {
  lineNumber: number;
  reason: string;
}

/** Result of analyzing a Refine JSONL export file. */
export interface DatasetAnalysis {
  type: DetectedDatasetType;
  totalEntries: number;
  preferencePairCount: number;
  nodeCount: number;
  sftCount: number;
  invalidLines: number;
  invalidLineDetails: InvalidLineDetail[];
}

/** Check whether a parsed object has all specified fields. */
function hasAllFields(
  obj: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((f) => f in obj);
}

/**
 * Detect the dataset type by reading a JSONL file.
 * Inspects up to the first `sampleSize` lines to classify entries.
 * Returns 'dpo' if only preference pairs, 'sft' if only nodes, 'mixed' if both.
 */
export function detectDatasetType(
  lines: string[],
): DetectedDatasetType {
  let hasPairs = false;
  let hasNodes = false;
  let hasSft = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (hasAllFields(parsed, DPO_FIELDS)) {
        hasPairs = true;
      } else if (hasAllFields(parsed, NODE_FIELDS)) {
        hasNodes = true;
      } else if (hasAllFields(parsed, SFT_FIELDS)) {
        hasSft = true;
      }
    } catch {
      // Skip invalid lines
    }
  }

  if (hasPairs && (hasNodes || hasSft)) return 'mixed';
  if (hasPairs) return 'dpo';
  if (hasSft || hasNodes) return 'sft';
  return 'sft';
}

/**
 * Fully analyze a Refine JSONL export file.
 * Reads all lines and counts preference pairs, nodes, and invalid entries.
 */
/** Max invalid line details to keep (avoid flooding output). */
const MAX_INVALID_DETAILS = 10;

/**
 * Fully analyze a Refine JSONL export file.
 * Reads all lines and counts preference pairs, nodes, and invalid entries.
 * Collects details for the first 10 invalid lines for user feedback.
 */
export async function analyzeRefineExport(
  filePath: string,
): Promise<DatasetAnalysis> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Cannot read file: ${msg}`);
  }

  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('JSONL file is empty — no lines found.');
  }

  let preferencePairCount = 0;
  let nodeCount = 0;
  let sftCount = 0;
  let invalidLines = 0;
  const invalidLineDetails: InvalidLineDetail[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (hasAllFields(parsed, DPO_FIELDS)) {
        preferencePairCount++;
      } else if (hasAllFields(parsed, NODE_FIELDS)) {
        nodeCount++;
      } else if (hasAllFields(parsed, SFT_FIELDS)) {
        sftCount++;
      } else {
        invalidLines++;
        if (invalidLineDetails.length < MAX_INVALID_DETAILS) {
          const keys = Object.keys(parsed).slice(0, 5).join(', ');
          invalidLineDetails.push({
            lineNumber: i + 1,
            reason: `unrecognized fields: {${keys}}`,
          });
        }
      }
    } catch (err: unknown) {
      invalidLines++;
      if (invalidLineDetails.length < MAX_INVALID_DETAILS) {
        const detail = err instanceof Error ? err.message : 'invalid JSON';
        invalidLineDetails.push({ lineNumber: i + 1, reason: detail });
      }
    }
  }

  const type = detectDatasetType(lines);
  const totalEntries = preferencePairCount + nodeCount + sftCount;

  return {
    type, totalEntries, preferencePairCount, nodeCount,
    sftCount, invalidLines, invalidLineDetails,
  };
}

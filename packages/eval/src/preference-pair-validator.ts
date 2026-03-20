/**
 * Validates preference pair quality and TRL format correctness.
 * Ensures chosen/rejected pairs are properly structured for training.
 * @module eval/preference-pair-validator
 */

import type { PreferencePair } from '@useody/platform-core';

/** UUID v4 pattern used to detect prompts containing raw IDs instead of natural language. */
const UUID_V4_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Validation issue for a preference pair. */
export interface PairValidationIssue {
  pairIndex: number;
  field: string;
  issue: string;
  severity: 'error' | 'warning';
}

/** Result of validating a set of preference pairs. */
export interface PairValidationResult {
  valid: boolean;
  totalPairs: number;
  validPairs: number;
  issues: PairValidationIssue[];
}

/**
 * Validate that preference pairs are well-formed for DPO training.
 * Checks:
 * - prompt, chosen, rejected are non-empty strings
 * - chosen !== rejected (they should be meaningfully different)
 * - metadata has required fields
 * - confidence is in [0, 1]
 */
export function validatePreferencePairs(
  pairs: PreferencePair[],
): PairValidationResult {
  const issues: PairValidationIssue[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;

    if (!pair.prompt || pair.prompt.trim().length === 0) {
      issues.push({ pairIndex: i, field: 'prompt', issue: 'Empty prompt', severity: 'error' });
    }

    if (!pair.chosen || pair.chosen.trim().length === 0) {
      issues.push({ pairIndex: i, field: 'chosen', issue: 'Empty chosen response', severity: 'error' });
    }

    if (!pair.rejected || pair.rejected.trim().length === 0) {
      issues.push({ pairIndex: i, field: 'rejected', issue: 'Empty rejected response', severity: 'error' });
    }

    if (pair.chosen === pair.rejected) {
      issues.push({
        pairIndex: i, field: 'chosen/rejected',
        issue: 'Chosen and rejected are identical', severity: 'error',
      });
    }

    if (pair.chosen && pair.rejected && pair.chosen.trim() === pair.rejected.trim()) {
      issues.push({
        pairIndex: i, field: 'chosen/rejected',
        issue: 'Chosen and rejected are identical after trimming', severity: 'error',
      });
    }

    if (!pair.metadata) {
      issues.push({ pairIndex: i, field: 'metadata', issue: 'Missing metadata', severity: 'error' });
      continue;
    }

    if (pair.metadata.confidence < 0 || pair.metadata.confidence > 1) {
      issues.push({
        pairIndex: i, field: 'metadata.confidence',
        issue: `Confidence ${pair.metadata.confidence} outside [0, 1]`, severity: 'error',
      });
    }

    if (!pair.metadata.sourceNodeIds || pair.metadata.sourceNodeIds.length === 0) {
      issues.push({
        pairIndex: i, field: 'metadata.sourceNodeIds',
        issue: 'No source node IDs', severity: 'warning',
      });
    }

    if (pair.prompt.length < 10) {
      issues.push({
        pairIndex: i, field: 'prompt',
        issue: 'Prompt very short (< 10 chars)', severity: 'warning',
      });
    }

    if (UUID_V4_RE.test(pair.prompt)) {
      issues.push({
        pairIndex: i, field: 'prompt',
        issue: 'Prompt contains UUID — should be natural language, not node IDs',
        severity: 'error',
      });
    }

    if (pair.chosen && UUID_V4_RE.test(pair.chosen) && pair.chosen.length < 40) {
      issues.push({
        pairIndex: i, field: 'chosen',
        issue: 'Chosen response looks like a UUID reference, not content',
        severity: 'warning',
      });
    }

    if (pair.rejected && UUID_V4_RE.test(pair.rejected) && pair.rejected.length < 40) {
      issues.push({
        pairIndex: i, field: 'rejected',
        issue: 'Rejected response looks like a UUID reference, not content',
        severity: 'warning',
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const validPairs = pairs.length - new Set(
    issues.filter((i) => i.severity === 'error').map((i) => i.pairIndex),
  ).size;

  return {
    valid: errorCount === 0,
    totalPairs: pairs.length,
    validPairs,
    issues,
  };
}

/**
 * Validate TRL DPO JSONL format.
 * Each line should parse to { prompt: string, chosen: string, rejected: string }.
 */
export function validateTrlDpoJsonl(jsonl: string): PairValidationResult {
  const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
  const issues: PairValidationIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const record = JSON.parse(lines[i]!) as Record<string, unknown>;
      if (typeof record['prompt'] !== 'string') {
        issues.push({ pairIndex: i, field: 'prompt', issue: 'Missing or non-string prompt', severity: 'error' });
      }
      if (typeof record['chosen'] !== 'string') {
        issues.push({ pairIndex: i, field: 'chosen', issue: 'Missing or non-string chosen', severity: 'error' });
      }
      if (typeof record['rejected'] !== 'string') {
        issues.push({ pairIndex: i, field: 'rejected', issue: 'Missing or non-string rejected', severity: 'error' });
      }
      // TRL DPO should NOT have metadata
      if ('metadata' in record) {
        issues.push({ pairIndex: i, field: 'metadata', issue: 'TRL format should not include metadata', severity: 'warning' });
      }
      // Prompt must be natural language, not UUIDs
      if (typeof record['prompt'] === 'string' && UUID_V4_RE.test(record['prompt'])) {
        issues.push({
          pairIndex: i, field: 'prompt',
          issue: 'Prompt contains UUID — should be natural language',
          severity: 'error',
        });
      }
    } catch {
      issues.push({ pairIndex: i, field: 'json', issue: 'Invalid JSON on line', severity: 'error' });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    valid: errorCount === 0,
    totalPairs: lines.length,
    validPairs: lines.length - new Set(
      issues.filter((i) => i.severity === 'error').map((i) => i.pairIndex),
    ).size,
    issues,
  };
}

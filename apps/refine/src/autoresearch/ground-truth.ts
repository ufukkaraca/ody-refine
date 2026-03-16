/**
 * Ground truth loader and scoring functions.
 * @module autoresearch/ground-truth
 */
import { readFileSync } from 'node:fs';
import type { Detection, DetectionType } from '@useody/platform-core';

/** A single labeled ground truth finding. */
export interface GroundTruth {
  type: DetectionType;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  /** true = real issue that should be found, false = should NOT be flagged. */
  shouldFind: boolean;
}

/** Raw shape of the ground truth JSON file. */
interface GroundTruthFile {
  corpus: string;
  findings: Array<{
    type: string;
    description: string;
    severity: string;
    shouldFind: boolean;
  }>;
}

/** Precision, recall, F1 scores. */
export interface ScoreResult {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

const VALID_TYPES = new Set<string>([
  'contradiction', 'duplicate', 'staleness', 'undocumented', 'time_bomb',
]);
const VALID_SEVERITIES = new Set<string>(['critical', 'warning', 'info']);

/** Load ground truth from a JSON file. */
export function loadGroundTruth(path: string): GroundTruth[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as GroundTruthFile;

  if (!Array.isArray(parsed.findings)) {
    throw new Error(`Ground truth file must have a "findings" array`);
  }

  return parsed.findings.map((f, i) => {
    if (!VALID_TYPES.has(f.type)) {
      throw new Error(`Finding ${String(i)}: invalid type "${f.type}"`);
    }
    if (!VALID_SEVERITIES.has(f.severity)) {
      throw new Error(`Finding ${String(i)}: invalid severity "${f.severity}"`);
    }
    return {
      type: f.type as DetectionType,
      description: f.description,
      severity: f.severity as 'critical' | 'warning' | 'info',
      shouldFind: Boolean(f.shouldFind),
    };
  });
}

/**
 * Score detections against ground truth using fuzzy text matching.
 *
 * A detection "matches" a ground truth finding if:
 * 1. Same detection type
 * 2. Description shares significant token overlap (>40%)
 */
export function scoreDetections(
  detections: Detection[],
  truth: GroundTruth[],
): ScoreResult {
  const positives = truth.filter((t) => t.shouldFind);
  const negatives = truth.filter((t) => !t.shouldFind);

  const matched = new Set<number>();
  let falsePositives = 0;

  for (const det of detections) {
    let foundMatch = false;

    // Check against positive truth entries
    for (let i = 0; i < positives.length; i++) {
      if (matched.has(i)) continue;
      const gt = positives[i]!;
      if (det.type === gt.type && descriptionOverlap(det.description, gt.description) > 0.4) {
        matched.add(i);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      // Check if it matches a negative (shouldn't have been found)
      const matchesNeg = negatives.some(
        (gt) => det.type === gt.type && descriptionOverlap(det.description, gt.description) > 0.4,
      );
      if (matchesNeg) {
        falsePositives++;
      }
      // Detections not matching any truth entry are also false positives
      if (!matchesNeg && !foundMatch) {
        falsePositives++;
      }
    }
  }

  const truePositives = matched.size;
  const falseNegatives = positives.length - truePositives;

  const precision = truePositives + falsePositives === 0
    ? 0
    : truePositives / (truePositives + falsePositives);
  const recall = positives.length === 0
    ? 1
    : truePositives / positives.length;
  const f1 = precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);

  return { precision, recall, f1, truePositives, falsePositives, falseNegatives };
}

/** Compute token overlap ratio between two descriptions. */
function descriptionOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }

  const smaller = Math.min(tokensA.size, tokensB.size);
  return smaller === 0 ? 0 : overlap / smaller;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'and',
  'but', 'or', 'nor', 'not', 'so', 'yet', 'at', 'by', 'for',
  'in', 'of', 'on', 'to', 'up', 'vs', 'with', 'from',
]);

/** Tokenize text into a set of meaningful lowercase words. */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

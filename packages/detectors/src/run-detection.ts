/**
 * Simple detection orchestrator — runs all five detectors on in-memory arrays.
 * Use this for library / adapter integration where nodes and edges are
 * already loaded (no repository or vector index required).
 * @module run-detection
 */
import type {
  Detection,
  DetectorFn,
  KnowledgeEdge,
  KnowledgeNode,
  LLMProvider,
} from '@useody/platform-core';
import { detectContradictions } from './contradictions.js';
import { detectDuplicates } from './duplicates.js';
import { detectStaleness } from './staleness.js';
import { detectUndocumented } from './undocumented.js';
import { detectTimeBombs } from './time-bombs.js';
import { detectAugmented } from './llm-augmented.js';
import { pairKey } from './prompts.js';

export interface RunDetectionInput {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  llm?: LLMProvider;
  detectors?: DetectorFn[];
  onProgress?: (name: string, status: 'started' | 'completed') => void;
}

export interface DetectorRunStats {
  name: string;
  detectionCount: number;
  durationMs: number;
}

export interface RunDetectionOutput {
  detections: Detection[];
  stats: DetectorRunStats[];
}

const DEFAULT_DETECTORS: DetectorFn[] = [
  detectContradictions,
  detectDuplicates,
  detectStaleness,
  detectUndocumented,
  detectTimeBombs,
];

/**
 * Run detection across in-memory knowledge nodes and edges.
 * By default runs all five detectors; pass `detectors` to override.
 */
export async function runDetection(
  input: RunDetectionInput,
): Promise<RunDetectionOutput> {
  const { nodes, edges, llm, onProgress } = input;
  const detectors = input.detectors ?? DEFAULT_DETECTORS;
  const allDetections: Detection[] = [];
  const stats: DetectorRunStats[] = [];

  for (const detector of detectors) {
    const name = detector.name || 'unknown';
    onProgress?.(name, 'started');
    const start = Date.now();
    try {
      const detections = await detector(nodes, edges, llm);
      const durationMs = Date.now() - start;
      allDetections.push(...detections);
      stats.push({ name, detectionCount: detections.length, durationMs });
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      stats.push({ name, detectionCount: 0, durationMs });
      // Re-throw fatal errors (auth/quota); skip transient ones
      if (err instanceof Error && (err.name === 'LLMAuthError'
        || err.message.includes('authentication/quota error'))) {
        throw err;
      }
      // Transient error — continue with remaining detectors
    }
    onProgress?.(name, 'completed');
  }

  // LLM-augmented layer: runs after heuristic detectors when LLM is available
  if (llm) {
    onProgress?.('llm-augmented', 'started');
    const augStart = Date.now();
    try {
      // Build seen set from existing detections for deduplication
      const seenPairs = new Set<string>();
      for (const det of allDetections) {
        if (det.nodeIds.length >= 2) {
          seenPairs.add(pairKey(det.nodeIds[0]!, det.nodeIds[1]!));
        }
      }
      const augmented = await detectAugmented(nodes, edges, llm, seenPairs);
      const augDuration = Date.now() - augStart;
      allDetections.push(...augmented);
      stats.push({
        name: 'llm-augmented',
        detectionCount: augmented.length,
        durationMs: augDuration,
      });
    } catch (err: unknown) {
      const augDuration = Date.now() - augStart;
      stats.push({ name: 'llm-augmented', detectionCount: 0, durationMs: augDuration });
      if (err instanceof Error && (err.name === 'LLMAuthError'
        || err.message.includes('authentication/quota error'))) {
        throw err;
      }
    }
    onProgress?.('llm-augmented', 'completed');
  }

  return { detections: allDetections, stats };
}

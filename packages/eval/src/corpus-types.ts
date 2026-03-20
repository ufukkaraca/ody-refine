/**
 * Type definitions for corpus-based evaluation fixtures.
 * These types represent the ground-truth data loaded from fixture JSON files.
 * @module eval/corpus-types
 */

/** A single expected finding in the ground truth. */
export interface ExpectedFinding {
  type: string;
  minSeverity: 'critical' | 'warning' | 'info';
  description: string;
}

/** A document pair in the contradiction ground truth corpus. */
export interface ContradictionPairSpec {
  id: string;
  category: string;
  hasContradiction: boolean;
  docA: string;
  docB: string;
  expectedFinding: ExpectedFinding | null;
}

/** Full contradiction corpus ground truth. */
export interface ContradictionGroundTruth {
  corpus: string;
  description: string;
  pairs: ContradictionPairSpec[];
}

/** Raw fixture node (before hydration with embeddings/dates). */
export interface FixtureNode {
  id: string;
  pairId?: string;
  title: string;
  content: {
    summary: string;
    facts?: string[];
    entities?: Array<{ name: string; type: string }>;
    raw?: string;
    source?: {
      sourceType: string;
      sourceId: string;
      lastModified?: string;
    };
  };
  confidence: number;
}

/** Staleness ground truth document spec. */
export interface StalenessDocSpec {
  id: string;
  isStale: boolean;
  reason: string;
  expectedSeverity?: 'critical' | 'warning' | 'info';
}

/** Full staleness corpus ground truth. */
export interface StalenessGroundTruth {
  corpus: string;
  description: string;
  documents: StalenessDocSpec[];
}

/** Raw fixture edge. */
export interface FixtureEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  reason: string;
  confidence: number;
  createdAt?: string;
}

/** Precision/recall/F1 metrics for a detector evaluation. */
export interface PrecisionRecallF1 {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

/** Result of a corpus benchmark run. */
export interface CorpusBenchmarkResult {
  corpus: string;
  detectorType: string;
  metrics: PrecisionRecallF1;
  details: Array<{
    pairId: string;
    expected: boolean;
    detected: boolean;
    correct: boolean;
  }>;
  runAt: Date;
}

/** Preference pair from fixture (with string dates). */
export interface FixturePreferencePair {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata: {
    conflictType: string;
    resolvedBy: string;
    resolvedAt: string;
    confidence: number;
    sourceNodeIds: string[];
  };
}

/** A domain question for forge evaluation. */
export interface ForgeEvalQuestion {
  id: string;
  question: string;
  correctAnswer: string;
  incorrectAnswer: string;
  domain: string;
  source: string;
}

/** Beats-baseline question. */
export interface BaselineQuestion {
  id: string;
  question: string;
  correctAnswer: string;
  whyBaselineFails: string;
}

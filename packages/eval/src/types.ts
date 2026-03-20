/**
 * Type definitions for the eval package.
 * @module eval/types
 */

/** A benchmark containing evaluation items for testing model quality. */
export interface Benchmark {
  id: string;
  name: string;
  items: EvalItem[];
  datasetVersion: string;
  createdAt: Date;
}

/** A single evaluation item within a benchmark. */
export interface EvalItem {
  id: string;
  question: string;
  expectedAnswer: string;
  domain: string;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceNodeIds: string[];
}

/** Scores for a single evaluation item. */
export interface ItemResult {
  itemId: string;
  modelAnswer: string;
  scores: {
    accuracy: number;
    similarity: number;
    contradicts: boolean;
  };
}

/** Aggregated results from running a benchmark against a model. */
export interface EvalResult {
  benchmarkId: string;
  modelId: string;
  scores: {
    accuracy: number;
    semanticSimilarity: number;
    contradictionRate: number;
    avgConfidence: number;
  };
  itemResults: ItemResult[];
  runAt: Date;
}

/** Report comparing two model evaluations. */
export interface ComparisonReport {
  models: string[];
  winner: string | null;
  deltas: Record<string, number>;
  regressions: string[];
  improvements: string[];
}

/** Result of an eval gate check (pass/fail for model promotion). */
export interface EvalGateResult {
  passed: boolean;
  currentModelId: string;
  candidateModelId: string;
  regressions: Array<{ metric: string; current: number; candidate: number }>;
  reasoning: string;
}

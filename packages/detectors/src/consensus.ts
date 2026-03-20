/**
 * Consensus voting engine for consultant analysis.
 * Runs analysis N times, groups findings by similarity,
 * and keeps only those appearing in a majority of passes.
 * @module consensus
 */
import type { LLMProvider } from '@useody/platform-core';
import type {
  AnalysisInput,
  AnalysisResult,
  ConsultingFinding,
  DocumentInfo,
} from './consultant-analysis.js';
import { analyzeCorpus } from './consultant-analysis.js';
import { computeDeterministicHealthScore } from './health-score.js';

/** Options for consensus analysis. */
export interface ConsensusOptions {
  /** Number of analysis passes (default 3). */
  passes?: number;
  /** Minimum votes (passes) a finding must appear in to survive. Default: ceil(passes/2). */
  minVotes?: number;
  /** Max tokens per LLM call. */
  maxTokens?: number;
  /** Logger callback for progress. */
  logger?: (msg: string) => void;
}

/** A finding cluster groups semantically similar findings across passes. */
interface FindingCluster {
  findings: ConsultingFinding[];
  passIndices: Set<number>;
}

/**
 * Normalize a headline for grouping.
 * Lowercases, strips punctuation, collapses whitespace.
 */
function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute word-overlap similarity between two strings (Jaccard). */
function wordSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeHeadline(a).split(' '));
  const wordsB = new Set(normalizeHeadline(b).split(' '));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Check if two findings match the same affected documents. */
function documentsOverlap(a: ConsultingFinding, b: ConsultingFinding): boolean {
  if (a.affectedDocuments.length === 0 || b.affectedDocuments.length === 0) {
    return false;
  }
  const setA = new Set(a.affectedDocuments);
  for (const doc of b.affectedDocuments) {
    if (setA.has(doc)) return true;
  }
  return false;
}

/** Determine if two findings are semantically similar enough to cluster. */
function areSimilar(a: ConsultingFinding, b: ConsultingFinding): boolean {
  if (a.category !== b.category) return false;
  const headlineSim = wordSimilarity(a.headline, b.headline);
  if (headlineSim >= 0.5) return true;
  return documentsOverlap(a, b) && headlineSim >= 0.3;
}

/** Group findings into clusters by semantic similarity. */
function clusterFindings(
  allFindings: Array<{ finding: ConsultingFinding; passIndex: number }>,
): FindingCluster[] {
  const clusters: FindingCluster[] = [];

  for (const { finding, passIndex } of allFindings) {
    let matched = false;
    for (const cluster of clusters) {
      if (areSimilar(cluster.findings[0]!, finding)) {
        cluster.findings.push(finding);
        cluster.passIndices.add(passIndex);
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({
        findings: [finding],
        passIndices: new Set([passIndex]),
      });
    }
  }
  return clusters;
}

/** Pick the best headline from a cluster (longest, most specific). */
function bestHeadline(findings: ConsultingFinding[]): string {
  let best = findings[0]!.headline;
  for (const f of findings) {
    if (f.headline.length > best.length) {
      best = f.headline;
    }
  }
  return best;
}

/** Pick the median severity from a cluster. */
function medianSeverity(
  findings: ConsultingFinding[],
): 'critical' | 'warning' | 'info' {
  const order: Record<string, number> = { critical: 2, warning: 1, info: 0 };
  const sorted = findings
    .map((f) => order[f.severity] ?? 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const val = sorted[mid]!;
  if (val >= 2) return 'critical';
  if (val >= 1) return 'warning';
  return 'info';
}

/** Merge all evidence from a cluster, deduplicating by quote. */
function mergeEvidence(
  findings: ConsultingFinding[],
): Array<{ source: string; quote: string }> {
  const seen = new Set<string>();
  const result: Array<{ source: string; quote: string }> = [];
  for (const f of findings) {
    for (const e of f.evidence) {
      const key = `${e.source}::${e.quote}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(e);
      }
    }
  }
  return result;
}

/** Merge a cluster into a single consensus finding. */
function mergeCluster(cluster: FindingCluster): ConsultingFinding {
  const base = cluster.findings[0]!;
  const allDocs = new Set<string>();
  for (const f of cluster.findings) {
    for (const d of f.affectedDocuments) allDocs.add(d);
  }
  return {
    category: base.category,
    severity: medianSeverity(cluster.findings),
    headline: bestHeadline(cluster.findings),
    evidence: mergeEvidence(cluster.findings),
    businessImpact: base.businessImpact,
    recommendation: base.recommendation,
    effort: base.effort,
    affectedDocuments: [...allDocs],
  };
}

/** Merge document maps from multiple passes. */
function mergeDocumentMaps(maps: DocumentInfo[][]): DocumentInfo[] {
  const byPath = new Map<string, DocumentInfo>();
  for (const map of maps) {
    for (const doc of map) {
      const existing = byPath.get(doc.path);
      if (!existing || doc.topics.length > existing.topics.length) {
        byPath.set(doc.path, doc);
      }
    }
  }
  return [...byPath.values()];
}

/** Compute the median of an array of numbers. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

/**
 * Run consensus analysis: multiple passes with majority voting.
 * Findings must appear in >= ceil(N/2) passes to be kept.
 * Health scores are computed deterministically from consensus findings.
 */
export async function runConsensusAnalysis(
  input: AnalysisInput,
  llm: LLMProvider,
  options?: ConsensusOptions,
): Promise<AnalysisResult> {
  const passes = options?.passes ?? 3;
  const log = options?.logger ?? ((): void => {});
  const maxTokens = options?.maxTokens;
  const threshold = options?.minVotes ?? Math.ceil(passes / 2);

  const taggedFindings: Array<{ finding: ConsultingFinding; passIndex: number }> = [];

  log(`Running ${String(passes)} passes in parallel...`);
  const passPromises = Array.from({ length: passes }, (_, i) => {
    const passLog = (msg: string): void => log(`[Pass ${String(i + 1)}] ${msg}`);
    return analyzeCorpus(input, llm, { maxTokens, logger: passLog })
      .then((result): { passIndex: number; result: AnalysisResult } => {
        passLog(`Complete: ${String(result.findings.length)} findings`);
        return { passIndex: i, result };
      })
      .catch((err: unknown): null => {
        const msg = err instanceof Error ? err.message : String(err);
        passLog(`Failed: ${msg}`);
        return null;
      });
  });

  const settled = await Promise.all(passPromises);
  const results: AnalysisResult[] = [];
  for (const entry of settled) {
    if (entry) {
      results.push(entry.result);
      for (const finding of entry.result.findings) {
        taggedFindings.push({ finding, passIndex: entry.passIndex });
      }
    }
  }

  log('Building consensus...');

  const clusters = clusterFindings(taggedFindings);
  const consensusFindings: ConsultingFinding[] = [];

  for (const cluster of clusters) {
    if (cluster.passIndices.size >= threshold) {
      consensusFindings.push(mergeCluster(cluster));
    }
  }

  const healthScore = computeDeterministicHealthScore(consensusFindings);
  const documentMap = mergeDocumentMaps(results.map((r) => r.documentMap));
  const totalTokens = median(results.map((r) => r.metadata.totalTokens));

  return {
    findings: consensusFindings,
    healthScore,
    documentMap,
    metadata: {
      analyzedAt: new Date().toISOString(),
      documentCount: input.documents.length,
      totalTokens,
      modelUsed: `${llm.getModelId()} (${String(passes)}-pass consensus)`,
    },
  };
}

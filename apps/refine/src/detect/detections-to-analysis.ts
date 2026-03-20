/**
 * Adapter: converts heuristic Detection[] into AnalysisResult for the consulting report.
 * Bridges the no-LLM detector path to the consulting report template.
 * @module detect/detections-to-analysis
 */
import type { Detection, DetectionType } from '@useody/platform-core';
import type {
  AnalysisResult,
  ConsultingFinding,
  FindingCategory,
  HealthScore,
  DocumentInfo,
} from '@useody/export';

/** Map pipeline DetectionType → consulting FindingCategory. */
const TYPE_TO_CATEGORY: Record<DetectionType, FindingCategory> = {
  contradiction: 'contradiction',
  staleness: 'stale_commitment',
  undocumented: 'tribal_knowledge',
  duplicate: 'duplicate_truth',
  time_bomb: 'commitment_without_followthrough',
};

/** Infer effort from severity. */
function inferEffort(severity: string): 'quick_win' | 'medium' | 'major' {
  if (severity === 'critical') return 'major';
  if (severity === 'warning') return 'medium';
  return 'quick_win';
}

/** Extract a headline from a detection. */
function extractHeadline(d: Detection): string {
  const meta = d.metadata ?? {};
  const topic = typeof meta['topic'] === 'string' ? meta['topic'] : null;
  if (topic) return topic;
  const desc = d.description;
  const colonIdx = desc.indexOf(':');
  if (colonIdx > 0 && colonIdx < 60) return desc.slice(0, colonIdx);
  return desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
}

/** Build evidence array from detection metadata. */
function buildEvidence(d: Detection): Array<{ source: string; quote: string }> {
  const meta = d.metadata ?? {};
  const evidence: Array<{ source: string; quote: string }> = [];
  if (Array.isArray(meta['evidence'])) {
    for (const e of meta['evidence'] as Array<{ source?: string; quote?: string }>) {
      if (typeof e?.source === 'string' && typeof e?.quote === 'string') {
        evidence.push({ source: e.source, quote: e.quote });
      }
    }
  }
  if (evidence.length === 0) {
    const claimA = typeof meta['claimA'] === 'string' ? meta['claimA'] : null;
    const claimB = typeof meta['claimB'] === 'string' ? meta['claimB'] : null;
    if (claimA) evidence.push({ source: d.nodeIds[0] ?? 'unknown', quote: claimA });
    if (claimB) evidence.push({ source: d.nodeIds[1] ?? 'unknown', quote: claimB });
  }
  if (evidence.length === 0) {
    evidence.push({ source: d.nodeIds[0] ?? 'unknown', quote: d.description });
  }
  return evidence;
}

/** Collect unique document paths from detections. */
function collectDocumentPaths(d: Detection): string[] {
  const nodes = d.metadata?.['nodes'];
  if (Array.isArray(nodes)) {
    return (nodes as Array<{ source?: string | null }>)
      .map((n) => n.source)
      .filter((s): s is string => typeof s === 'string');
  }
  return d.nodeIds;
}

/** Convert a single Detection to a ConsultingFinding. */
function detectionToFinding(d: Detection): ConsultingFinding {
  return {
    category: TYPE_TO_CATEGORY[d.type],
    severity: d.severity,
    headline: extractHeadline(d),
    evidence: buildEvidence(d),
    businessImpact: typeof d.metadata?.['impact'] === 'string'
      ? d.metadata['impact'] as string
      : `${d.severity === 'critical' ? 'High' : 'Moderate'}-risk ${d.type} detected`,
    recommendation: d.suggestedAction ?? 'Review and resolve this finding.',
    effort: typeof d.metadata?.['effort'] === 'string'
      ? d.metadata['effort'] as 'quick_win' | 'medium' | 'major'
      : inferEffort(d.severity),
    affectedDocuments: collectDocumentPaths(d),
  };
}

/** Compute health score dimensions heuristically from detections. */
function computeHealthScore(detections: Detection[]): HealthScore {
  const byType: Record<string, Detection[]> = {};
  for (const d of detections) {
    (byType[d.type] ??= []).push(d);
  }

  const penalize = (dets: Detection[] | undefined): number => {
    if (!dets || dets.length === 0) return 100;
    const crits = dets.filter((d) => d.severity === 'critical').length;
    const warns = dets.filter((d) => d.severity === 'warning').length;
    return Math.max(0, 100 - crits * 15 - warns * 5);
  };

  const consistency = penalize(byType['contradiction']);
  const freshness = penalize([...(byType['staleness'] ?? []), ...(byType['time_bomb'] ?? [])]);
  const ownership = penalize(byType['undocumented']);
  const coverage = penalize(byType['duplicate']);

  const overall = Math.round(
    consistency * 0.35 + freshness * 0.25 + ownership * 0.2 + coverage * 0.2,
  );

  return { overall, consistency, freshness, ownership, coverage };
}

/** Build a minimal document map from detection metadata. */
function buildDocumentMap(detections: Detection[]): DocumentInfo[] {
  const seen = new Set<string>();
  const docs: DocumentInfo[] = [];

  for (const d of detections) {
    const nodes = d.metadata?.['nodes'];
    if (Array.isArray(nodes)) {
      for (const n of nodes as Array<{ id?: string; source?: string | null; title?: string }>) {
        const path = n.source ?? n.id ?? '';
        if (path && !seen.has(path)) {
          seen.add(path);
          docs.push({ path, title: n.title ?? path.split('/').pop() ?? path, topics: [] });
        }
      }
    }
  }
  return docs;
}

/** Pipeline stats passed from the runner. */
export interface PipelineStats {
  fileCount: number;
  durationMs: number;
}

/**
 * Convert heuristic Detection[] into an AnalysisResult for the consulting report.
 * Computes health score dimensions heuristically without LLM.
 */
export function detectionsToAnalysisResult(
  detections: Detection[],
  stats: PipelineStats,
): AnalysisResult {
  return {
    findings: detections.map(detectionToFinding),
    healthScore: computeHealthScore(detections),
    documentMap: buildDocumentMap(detections),
    metadata: {
      analyzedAt: new Date().toISOString(),
      documentCount: stats.fileCount,
      totalTokens: 0,
      modelUsed: 'heuristic (no LLM)',
    },
  };
}

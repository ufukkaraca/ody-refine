/**
 * Type definitions for the Ody Refine consulting-grade analysis.
 * These types are produced by the analysis engine and consumed by the report generator.
 * @module consulting-types
 */

/** The 7 categories of findings the consulting analysis produces. */
export type FindingCategory =
  | 'contradiction'
  | 'stale_commitment'
  | 'ownership_gap'
  | 'tribal_knowledge'
  | 'duplicate_truth'
  | 'commitment_without_followthrough'
  | 'decision_without_context';

/** A consulting-grade finding with business context and evidence. */
export interface ConsultingFinding {
  category: FindingCategory;
  severity: 'critical' | 'warning' | 'info';
  headline: string;
  evidence: Array<{ source: string; quote: string }>;
  businessImpact: string;
  recommendation: string;
  effort: 'quick_win' | 'medium' | 'major';
  affectedDocuments: string[];
}

/** Health score breakdown across dimensions. */
export interface HealthScore {
  overall: number;
  consistency: number;
  freshness: number;
  ownership: number;
  coverage: number;
}

/** A document in the analysis corpus. */
export interface DocumentInfo {
  path: string;
  title: string;
  lastModified?: string;
  topics: string[];
  owner?: string;
}

/** Full result from the consulting analysis engine. */
export interface AnalysisResult {
  findings: ConsultingFinding[];
  healthScore: HealthScore;
  documentMap: DocumentInfo[];
  metadata: {
    analyzedAt: string;
    documentCount: number;
    totalTokens: number;
    modelUsed: string;
  };
}

/** Human-readable labels for finding categories. */
export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  contradiction: 'Contradictions',
  stale_commitment: 'Stale Commitments',
  ownership_gap: 'Ownership Gaps',
  tribal_knowledge: 'Tribal Knowledge',
  duplicate_truth: 'Duplicate Truth',
  commitment_without_followthrough: 'Commitments Without Follow-Through',
  decision_without_context: 'Decisions Without Context',
};

/** Effort level labels with display metadata. */
export const EFFORT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  quick_win: { label: 'Quick Win', color: '#2d8a54', bg: 'rgba(45,138,84,0.08)' },
  medium: { label: 'Medium Effort', color: '#b8860b', bg: 'rgba(184,134,11,0.08)' },
  major: { label: 'Major Project', color: '#c03030', bg: 'rgba(192,48,48,0.08)' },
};

/** Category icon indicators (structural, not emoji in prose). */
export const CATEGORY_ICONS: Record<FindingCategory, string> = {
  contradiction: '&#9889;',
  stale_commitment: '&#9200;',
  ownership_gap: '&#128275;',
  tribal_knowledge: '&#128065;',
  duplicate_truth: '&#128260;',
  commitment_without_followthrough: '&#9888;',
  decision_without_context: '&#128269;',
};

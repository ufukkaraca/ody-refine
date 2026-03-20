/**
 * Source authority scoring for detection severity weighting.
 * Scores sources by role, document type, and recency. When a high-authority
 * source contradicts a low-authority one, severity is boosted (and vice versa).
 * @module detectors/source-authority
 */
import type { SourceMeta } from '@useody/platform-core';

/** Authority weight configuration. */
export interface AuthorityConfig {
  /** Weight multipliers by author role. */
  roleWeights: Record<string, number>;
  /** Weight multipliers by source type. */
  sourceTypeWeights: Record<string, number>;
  /** Half-life in days for recency decay. */
  recencyHalfLifeDays: number;
}

/** Default authority configuration. */
export const DEFAULT_AUTHORITY_CONFIG: AuthorityConfig = {
  roleWeights: {
    executive: 1.0,
    director: 0.9,
    manager: 0.8,
    lead: 0.75,
    engineer: 0.6,
    analyst: 0.6,
    bot: 0.3,
    unknown: 0.5,
  },
  sourceTypeWeights: {
    confluence: 0.9,
    notion: 0.85,
    google_docs: 0.8,
    sharepoint: 0.8,
    github: 0.7,
    slack: 0.4,
    email: 0.5,
    unknown: 0.5,
  },
  recencyHalfLifeDays: 180,
};

/**
 * Clamp a value to [0, 1], returning fallback on NaN/Infinity.
 */
export function clampScore(value: number, fallback = 0.5): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute recency decay factor.
 * Returns 1.0 for "just now", decays toward 0 for old documents.
 * Uses exponential decay with configurable half-life.
 */
export function recencyDecay(
  lastModified: Date | undefined,
  now: Date,
  halfLifeDays: number,
): number {
  if (!lastModified) return 0.5; // no date → neutral weight
  const ageDays = (now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1.0; // future date → fresh
  const decay = Math.pow(0.5, ageDays / halfLifeDays);
  return clampScore(decay);
}

/**
 * Compute authority score for a single source.
 * Combines role weight, source type weight, and recency.
 * Formula: (roleWeight * 0.4 + sourceTypeWeight * 0.3 + recencyFactor * 0.3)
 */
export function computeAuthority(
  source: SourceMeta,
  config: AuthorityConfig = DEFAULT_AUTHORITY_CONFIG,
  now: Date = new Date(),
): number {
  const role = (source.authorRole ?? 'unknown').toLowerCase();
  const roleWeight = config.roleWeights[role] ?? config.roleWeights['unknown'] ?? 0.5;

  const srcType = (source.sourceType ?? 'unknown').toLowerCase();
  const srcWeight = config.sourceTypeWeights[srcType]
    ?? config.sourceTypeWeights['unknown'] ?? 0.5;

  const recency = recencyDecay(source.lastModified, now, config.recencyHalfLifeDays);

  const raw = roleWeight * 0.4 + srcWeight * 0.3 + recency * 0.3;
  return clampScore(raw);
}

/**
 * Compute severity multiplier based on authority delta between two sources.
 * When a high-authority source contradicts a low-authority one → boost severity.
 * When a low-authority source contradicts a high-authority one → dampen.
 * Returns a multiplier in [0.5, 2.0].
 */
export function authorityDeltaMultiplier(
  authorityA: number,
  authorityB: number,
): number {
  const a = clampScore(authorityA);
  const b = clampScore(authorityB);
  // Both high authority → strongest signal (contradiction between trusted sources)
  const maxAuth = Math.max(a, b);
  const minAuth = Math.min(a, b);
  // Base: 1.0. Boost proportional to max authority, tempered by min.
  const multiplier = 0.5 + maxAuth * 1.0 + minAuth * 0.5;
  return clampScore(multiplier, 1.0) * 2.0;
}

/**
 * Apply source authority weighting to a base severity score.
 * Returns adjusted severity as 'critical' | 'warning' | 'info'.
 */
export function adjustSeverity(
  baseSeverity: 'critical' | 'warning' | 'info',
  sourceA: SourceMeta,
  sourceB: SourceMeta,
  config: AuthorityConfig = DEFAULT_AUTHORITY_CONFIG,
): 'critical' | 'warning' | 'info' {
  const authA = computeAuthority(sourceA, config);
  const authB = computeAuthority(sourceB, config);
  const multiplier = authorityDeltaMultiplier(authA, authB);

  const severityMap: Record<string, number> = {
    info: 1,
    warning: 2,
    critical: 3,
  };
  const reverseMap: Record<number, 'critical' | 'warning' | 'info'> = {
    1: 'info',
    2: 'warning',
    3: 'critical',
  };

  const baseScore = severityMap[baseSeverity] ?? 2;
  const adjusted = Math.round(baseScore * multiplier);
  const clamped = Math.max(1, Math.min(3, adjusted));
  return reverseMap[clamped] ?? 'warning';
}

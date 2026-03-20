/**
 * Tracks and computes user reputation scores.
 * @module feedback/reputation
 */

import type Database from 'better-sqlite3';
import type { ReputationScore } from './types.js';

/** Threshold label for a user's reputation. */
export type ReputationThreshold = 'trusted' | 'normal' | 'untrusted';

/** Tracks user reputation based on interaction signal history. */
export class ReputationTracker {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Calculate reputation score from signal history.
   * Formula: (correctCorrections * 2 + shared - rejected - escalated) / (totalSignals + 10)
   * Clamped to 0-1.
   */
  calculate(userId: string): number {
    const rows = this.db.prepare(
      'SELECT signal_type, COUNT(*) as cnt FROM interaction_signals WHERE user_id = ? GROUP BY signal_type',
    ).all(userId) as Array<{ signal_type: string; cnt: number }>;

    const counts: Record<string, number> = {};
    let totalSignals = 0;
    for (const row of rows) {
      counts[row.signal_type] = row.cnt;
      totalSignals += row.cnt;
    }

    const shared = counts['shared'] ?? 0;
    const rejected = counts['rejected'] ?? 0;
    const escalated = counts['escalated'] ?? 0;
    const corrected = counts['corrected'] ?? 0;

    const numerator = corrected * 2 + shared - rejected - escalated;
    const denominator = totalSignals + 10;
    const raw = numerator / denominator;

    return Math.min(1, Math.max(0, raw));
  }

  /** Get the stored reputation score for a user. */
  getScore(userId: string): ReputationScore | null {
    const row = this.db.prepare(
      'SELECT * FROM user_reputation WHERE user_id = ?',
    ).get(userId) as RawReputationRow | undefined;

    if (!row) return null;

    return rowToReputation(row);
  }

  /** Recalculate and store the reputation score. */
  update(userId: string): ReputationScore {
    const score = this.calculate(userId);

    const signalCounts = this.db.prepare(
      'SELECT signal_type, COUNT(*) as cnt FROM interaction_signals WHERE user_id = ? GROUP BY signal_type',
    ).all(userId) as Array<{ signal_type: string; cnt: number }>;

    const counts = toCountMap(signalCounts);
    const totalSignals = Object.values(counts).reduce((a, b) => a + b, 0);
    const now = new Date();

    this.db.prepare(`
      INSERT INTO user_reputation (user_id, score, total_signals, correct_corrections, overridden_corrections, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        score = excluded.score,
        total_signals = excluded.total_signals,
        correct_corrections = excluded.correct_corrections,
        overridden_corrections = excluded.overridden_corrections,
        last_updated = excluded.last_updated
    `).run(userId, score, totalSignals, counts['corrected'] ?? 0, 0, now.toISOString());

    return {
      userId,
      score,
      totalSignals,
      correctCorrections: counts['corrected'] ?? 0,
      overriddenCorrections: 0,
      lastUpdated: now,
    };
  }

  /** Get the threshold label for a user's reputation. */
  getThreshold(userId: string): ReputationThreshold {
    const score = this.calculate(userId);
    if (score >= 0.8) return 'trusted';
    if (score >= 0.4) return 'normal';
    return 'untrusted';
  }
}

interface RawReputationRow {
  user_id: string;
  score: number;
  total_signals: number;
  correct_corrections: number;
  overridden_corrections: number;
  last_updated: string;
}

function rowToReputation(row: RawReputationRow): ReputationScore {
  return {
    userId: row.user_id,
    score: row.score,
    totalSignals: row.total_signals,
    correctCorrections: row.correct_corrections,
    overriddenCorrections: row.overridden_corrections,
    lastUpdated: new Date(row.last_updated),
  };
}

function toCountMap(rows: Array<{ signal_type: string; cnt: number }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.signal_type] = row.cnt;
  }
  return map;
}

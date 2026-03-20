/**
 * Collects and queries interaction signals from users.
 * @module feedback/signal-collector
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type { InteractionSignal, SignalType } from './types.js';

/** Collects user interaction signals into SQLite. */
export class SignalCollector {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Record a new interaction signal. */
  record(signal: Omit<InteractionSignal, 'id' | 'createdAt'>): InteractionSignal {
    const id = crypto.randomUUID();
    const createdAt = new Date();

    this.db.prepare(`
      INSERT INTO interaction_signals
        (id, user_id, conversation_id, turn_id, signal_type, correction_text, question_node_ids, time_to_action_ms, reputation_weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      signal.userId,
      signal.conversationId,
      signal.turnId,
      signal.signalType,
      signal.correctionText ?? null,
      JSON.stringify(signal.questionNodeIds),
      signal.timeToActionMs,
      signal.reputationWeight,
      createdAt.toISOString(),
    );

    return { id, createdAt, ...signal };
  }

  /** Find all signals for a conversation. */
  findByConversation(conversationId: string): InteractionSignal[] {
    const rows = this.db.prepare(
      'SELECT * FROM interaction_signals WHERE conversation_id = ? ORDER BY created_at ASC',
    ).all(conversationId) as RawSignalRow[];

    return rows.map(rowToSignal);
  }

  /** Find recent signals for a user. */
  findByUser(userId: string, limit = 100): InteractionSignal[] {
    const rows = this.db.prepare(
      'SELECT * FROM interaction_signals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    ).all(userId, limit) as RawSignalRow[];

    return rows.map(rowToSignal);
  }

  /** Count signals by type for a user. */
  countByType(userId: string): Record<SignalType, number> {
    const rows = this.db.prepare(
      'SELECT signal_type, COUNT(*) as cnt FROM interaction_signals WHERE user_id = ? GROUP BY signal_type',
    ).all(userId) as Array<{ signal_type: string; cnt: number }>;

    const result: Record<SignalType, number> = {
      accepted: 0, rejected: 0, corrected: 0,
      escalated: 0, shared: 0, follow_up: 0,
      emoji_positive: 0, emoji_negative: 0,
      reply_positive: 0, reply_negative: 0,
    };

    for (const row of rows) {
      result[row.signal_type as SignalType] = row.cnt;
    }

    return result;
  }
}

interface RawSignalRow {
  id: string;
  user_id: string;
  conversation_id: string;
  turn_id: string;
  signal_type: string;
  correction_text: string | null;
  question_node_ids: string;
  time_to_action_ms: number;
  reputation_weight: number;
  created_at: string;
}

function rowToSignal(row: RawSignalRow): InteractionSignal {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    signalType: row.signal_type as SignalType,
    correctionText: row.correction_text ?? undefined,
    questionNodeIds: JSON.parse(row.question_node_ids) as string[],
    timeToActionMs: row.time_to_action_ms,
    reputationWeight: row.reputation_weight,
    createdAt: new Date(row.created_at),
  };
}

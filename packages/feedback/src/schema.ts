/**
 * SQLite schema for the feedback package.
 * @module feedback/schema
 */

import type Database from 'better-sqlite3';

/**
 * Create feedback tables in the given SQLite database.
 * Creates interaction_signals and user_reputation tables.
 */
export function createFeedbackSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interaction_signals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      signal_type TEXT NOT NULL CHECK(signal_type IN ('accepted','rejected','corrected','escalated','shared','follow_up','emoji_positive','emoji_negative','reply_positive','reply_negative')),
      correction_text TEXT,
      question_node_ids TEXT NOT NULL DEFAULT '[]',
      time_to_action_ms INTEGER NOT NULL,
      reputation_weight REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_signals_user_id ON interaction_signals(user_id);
    CREATE INDEX IF NOT EXISTS idx_signals_conversation_id ON interaction_signals(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON interaction_signals(signal_type);

    CREATE TABLE IF NOT EXISTS user_reputation (
      user_id TEXT PRIMARY KEY,
      score REAL NOT NULL DEFAULT 0.5,
      total_signals INTEGER NOT NULL DEFAULT 0,
      correct_corrections INTEGER NOT NULL DEFAULT 0,
      overridden_corrections INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

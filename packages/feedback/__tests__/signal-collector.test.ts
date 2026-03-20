import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SignalCollector } from '../src/signal-collector.js';
import { createFeedbackSchema } from '../src/schema.js';

describe('SignalCollector', () => {
  let db: Database.Database;
  let collector: SignalCollector;

  beforeEach(() => {
    db = new Database(':memory:');
    createFeedbackSchema(db);
    collector = new SignalCollector(db);
  });

  describe('record', () => {
    it('should store a signal and return it with id and createdAt', () => {
      const signal = collector.record({
        userId: 'user-1',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        signalType: 'accepted',
        questionNodeIds: ['node-1'],
        timeToActionMs: 500,
        reputationWeight: 1.0,
      });

      expect(signal.id).toBeDefined();
      expect(signal.createdAt).toBeInstanceOf(Date);
      expect(signal.signalType).toBe('accepted');
      expect(signal.userId).toBe('user-1');
    });

    it('should store correction text when provided', () => {
      const signal = collector.record({
        userId: 'user-1',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        signalType: 'corrected',
        correctionText: 'The answer should be X',
        questionNodeIds: ['node-1'],
        timeToActionMs: 2000,
        reputationWeight: 1.0,
      });

      expect(signal.correctionText).toBe('The answer should be X');
    });
  });

  describe('findByConversation', () => {
    it('should return all signals for a conversation', () => {
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-1',
        signalType: 'accepted', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
      });
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-2',
        signalType: 'rejected', questionNodeIds: [], timeToActionMs: 200, reputationWeight: 1,
      });
      collector.record({
        userId: 'user-1', conversationId: 'conv-2', turnId: 'turn-3',
        signalType: 'shared', questionNodeIds: [], timeToActionMs: 300, reputationWeight: 1,
      });

      const results = collector.findByConversation('conv-1');
      expect(results).toHaveLength(2);
      expect(results[0]!.signalType).toBe('accepted');
      expect(results[1]!.signalType).toBe('rejected');
    });

    it('should return empty array for unknown conversation', () => {
      expect(collector.findByConversation('unknown')).toEqual([]);
    });
  });

  describe('findByUser', () => {
    it('should return recent signals for a user', () => {
      for (let i = 0; i < 5; i++) {
        collector.record({
          userId: 'user-1', conversationId: `conv-${i}`, turnId: `turn-${i}`,
          signalType: 'accepted', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
        });
      }

      const results = collector.findByUser('user-1', 3);
      expect(results).toHaveLength(3);
    });

    it('should default to limit 100', () => {
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-1',
        signalType: 'accepted', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
      });

      const results = collector.findByUser('user-1');
      expect(results).toHaveLength(1);
    });
  });

  describe('countByType', () => {
    it('should count signals by type', () => {
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-1',
        signalType: 'accepted', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
      });
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-2',
        signalType: 'accepted', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
      });
      collector.record({
        userId: 'user-1', conversationId: 'conv-1', turnId: 'turn-3',
        signalType: 'rejected', questionNodeIds: [], timeToActionMs: 100, reputationWeight: 1,
      });

      const counts = collector.countByType('user-1');
      expect(counts.accepted).toBe(2);
      expect(counts.rejected).toBe(1);
      expect(counts.corrected).toBe(0);
      expect(counts.escalated).toBe(0);
      expect(counts.shared).toBe(0);
      expect(counts.follow_up).toBe(0);
    });

    it('should return all zeros for unknown user', () => {
      const counts = collector.countByType('unknown');
      expect(counts.accepted).toBe(0);
      expect(counts.rejected).toBe(0);
    });
  });
});

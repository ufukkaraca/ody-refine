import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReputationTracker } from '../src/reputation.js';
import { SignalCollector } from '../src/signal-collector.js';
import { createFeedbackSchema } from '../src/schema.js';
import type { SignalType } from '../src/types.js';

describe('ReputationTracker', () => {
  let db: Database.Database;
  let tracker: ReputationTracker;
  let collector: SignalCollector;

  beforeEach(() => {
    db = new Database(':memory:');
    createFeedbackSchema(db);
    tracker = new ReputationTracker(db);
    collector = new SignalCollector(db);
  });

  function addSignal(userId: string, signalType: SignalType): void {
    collector.record({
      userId,
      conversationId: 'conv-1',
      turnId: `turn-${crypto.randomUUID()}`,
      signalType,
      questionNodeIds: [],
      timeToActionMs: 100,
      reputationWeight: 1,
    });
  }

  describe('calculate', () => {
    it('should return 0 for a new user with no signals', () => {
      expect(tracker.calculate('nobody')).toBe(0);
    });

    it('should give positive score for shared signals', () => {
      addSignal('user-1', 'shared');
      addSignal('user-1', 'shared');
      addSignal('user-1', 'shared');

      const score = tracker.calculate('user-1');
      // (0*2 + 3 - 0 - 0) / (3 + 10) = 3/13 ≈ 0.23
      expect(score).toBeCloseTo(3 / 13, 5);
    });

    it('should give higher score for corrections', () => {
      addSignal('user-1', 'corrected');
      addSignal('user-1', 'corrected');

      const score = tracker.calculate('user-1');
      // (2*2 + 0 - 0 - 0) / (2 + 10) = 4/12 ≈ 0.33
      expect(score).toBeCloseTo(4 / 12, 5);
    });

    it('should penalize rejected and escalated signals', () => {
      addSignal('user-1', 'rejected');
      addSignal('user-1', 'escalated');

      const score = tracker.calculate('user-1');
      // (0 + 0 - 1 - 1) / (2 + 10) = -2/12 → clamped to 0
      expect(score).toBe(0);
    });

    it('should clamp score to maximum 1', () => {
      for (let i = 0; i < 50; i++) {
        addSignal('user-1', 'corrected');
        addSignal('user-1', 'shared');
      }

      const score = tracker.calculate('user-1');
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('getScore', () => {
    it('should return null for unknown user', () => {
      expect(tracker.getScore('nobody')).toBeNull();
    });

    it('should return stored score after update', () => {
      addSignal('user-1', 'shared');
      tracker.update('user-1');

      const rep = tracker.getScore('user-1');
      expect(rep).not.toBeNull();
      expect(rep!.userId).toBe('user-1');
      expect(rep!.totalSignals).toBe(1);
    });
  });

  describe('update', () => {
    it('should recalculate and store the reputation', () => {
      addSignal('user-1', 'shared');
      addSignal('user-1', 'corrected');

      const rep = tracker.update('user-1');
      // (1*2 + 1 - 0 - 0) / (2 + 10) = 3/12 = 0.25
      expect(rep.score).toBeCloseTo(3 / 12, 5);
      expect(rep.totalSignals).toBe(2);
      expect(rep.correctCorrections).toBe(1);
    });

    it('should update existing record on subsequent calls', () => {
      addSignal('user-1', 'shared');
      tracker.update('user-1');

      addSignal('user-1', 'shared');
      const rep = tracker.update('user-1');

      expect(rep.totalSignals).toBe(2);
    });
  });

  describe('getThreshold', () => {
    it('should return untrusted for new user', () => {
      expect(tracker.getThreshold('nobody')).toBe('untrusted');
    });

    it('should return trusted for high-reputation user', () => {
      // Need (c*2 + s - r - e) / (total + 10) >= 0.8
      // 50 corrections: (50*2) / (50+10) = 100/60 ≈ 1.67 → clamped to 1 → trusted
      for (let i = 0; i < 50; i++) {
        addSignal('user-1', 'corrected');
      }
      expect(tracker.getThreshold('user-1')).toBe('trusted');
    });

    it('should return normal for medium-reputation user', () => {
      // 10 corrections: (10*2) / (10+10) = 20/20 = 1.0 → trusted
      // 3 corrections + 3 rejected: (3*2 - 3) / (6+10) = 3/16 ≈ 0.19 → untrusted
      // 5 corrections: (5*2) / (5+10) = 10/15 ≈ 0.67 → normal
      for (let i = 0; i < 5; i++) {
        addSignal('user-1', 'corrected');
      }
      expect(tracker.getThreshold('user-1')).toBe('normal');
    });
  });
});

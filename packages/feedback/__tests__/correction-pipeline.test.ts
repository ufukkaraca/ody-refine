import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { processCorrection, validateCorrection } from '../src/correction-pipeline.js';
import { derivePreferencePairFromCorrection } from '../src/reward-derivation.js';
import { PreferencePairStore } from '../src/pair-store.js';
import { ReputationTracker } from '../src/reputation.js';
import { createFeedbackSchema } from '../src/schema.js';
import type { CorrectionSignal, InteractionSignal, ReputationScore } from '../src/types.js';

function makeSignal(overrides: Partial<InteractionSignal> = {}): InteractionSignal {
  return {
    id: 'sig-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    signalType: 'corrected',
    questionNodeIds: ['node-1'],
    timeToActionMs: 2000,
    reputationWeight: 1.0,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function makeCorrection(overrides: Partial<CorrectionSignal> = {}): CorrectionSignal {
  return {
    signal: makeSignal(),
    originalQuestion: 'What is our deployment cadence?',
    originalAnswer: 'We deploy daily.',
    correctedAnswer: 'We deploy weekly on Tuesdays after QA sign-off.',
    ...overrides,
  };
}

function makeReputation(overrides: Partial<ReputationScore> = {}): ReputationScore {
  return {
    userId: 'user-1',
    score: 0.7,
    totalSignals: 10,
    correctCorrections: 3,
    overriddenCorrections: 0,
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('validateCorrection', () => {
  it('should accept a valid correction', () => {
    const result = validateCorrection(makeCorrection());
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should reject empty corrected answer', () => {
    const result = validateCorrection(makeCorrection({ correctedAnswer: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Corrected answer is empty');
  });

  it('should reject whitespace-only corrected answer', () => {
    const result = validateCorrection(makeCorrection({ correctedAnswer: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Corrected answer is empty');
  });

  it('should reject empty original answer', () => {
    const result = validateCorrection(makeCorrection({ originalAnswer: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Original answer is empty');
  });

  it('should reject empty original question', () => {
    const result = validateCorrection(makeCorrection({ originalQuestion: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Original question is empty');
  });

  it('should reject identical correction (chosen === rejected)', () => {
    const result = validateCorrection(
      makeCorrection({
        originalAnswer: 'We deploy daily.',
        correctedAnswer: 'We deploy daily.',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('identical');
  });

  it('should reject UUID-only prompt', () => {
    const result = validateCorrection(
      makeCorrection({
        originalQuestion: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('UUID');
  });
});

describe('derivePreferencePairFromCorrection', () => {
  it('should create a pair from a valid correction', () => {
    const pair = derivePreferencePairFromCorrection(
      makeCorrection(),
      makeReputation({ score: 0.9 }),
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toBe('What is our deployment cadence?');
    expect(pair!.chosen).toBe('We deploy weekly on Tuesdays after QA sign-off.');
    expect(pair!.rejected).toBe('We deploy daily.');
    expect(pair!.metadata.confidence).toBe(1.0);
    expect(pair!.metadata.resolvedBy).toBe('user-1');
  });

  it('should return null for low reputation (<0.4)', () => {
    const pair = derivePreferencePairFromCorrection(
      makeCorrection(),
      makeReputation({ score: 0.2 }),
    );
    expect(pair).toBeNull();
  });

  it('should give confidence 0.6 for medium reputation (0.4-0.8)', () => {
    const pair = derivePreferencePairFromCorrection(
      makeCorrection(),
      makeReputation({ score: 0.5 }),
    );

    expect(pair).not.toBeNull();
    expect(pair!.metadata.confidence).toBe(0.6);
  });

  it('should give confidence 1.0 for high reputation (>=0.8)', () => {
    const pair = derivePreferencePairFromCorrection(
      makeCorrection(),
      makeReputation({ score: 0.95 }),
    );

    expect(pair).not.toBeNull();
    expect(pair!.metadata.confidence).toBe(1.0);
  });

  it('should reject UUID-only question', () => {
    const pair = derivePreferencePairFromCorrection(
      makeCorrection({
        originalQuestion: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      }),
      makeReputation({ score: 0.9 }),
    );
    expect(pair).toBeNull();
  });
});

describe('processCorrection (integration)', () => {
  let db: Database.Database;
  let pairStore: PreferencePairStore;
  let reputationTracker: ReputationTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    createFeedbackSchema(db);
    pairStore = new PreferencePairStore(db);
    reputationTracker = new ReputationTracker(db);
  });

  it('should create and store a preference pair from a valid correction', () => {
    const pair = processCorrection(
      makeCorrection(),
      pairStore,
      reputationTracker,
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toBe('What is our deployment cadence?');
    expect(pair!.chosen).toBe('We deploy weekly on Tuesdays after QA sign-off.');
    expect(pair!.rejected).toBe('We deploy daily.');
  });

  it('should persist the pair in the pair store', () => {
    processCorrection(makeCorrection(), pairStore, reputationTracker);

    expect(pairStore.count()).toBe(1);
    const pairs = pairStore.findUnexported();
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.prompt).toBe('What is our deployment cadence?');
  });

  it('should reject empty correction', () => {
    const pair = processCorrection(
      makeCorrection({ correctedAnswer: '' }),
      pairStore,
      reputationTracker,
    );

    expect(pair).toBeNull();
    expect(pairStore.count()).toBe(0);
  });

  it('should reject identical correction (chosen === rejected)', () => {
    const pair = processCorrection(
      makeCorrection({
        originalAnswer: 'Same answer',
        correctedAnswer: 'Same answer',
      }),
      pairStore,
      reputationTracker,
    );

    expect(pair).toBeNull();
    expect(pairStore.count()).toBe(0);
  });

  it('should give lower confidence for mid-reputation users', () => {
    // Seed signals to create a mid-range reputation.
    // Formula: (corrected*2 + shared - rejected - escalated) / (totalSignals + 10)
    // Goal: score between 0.4 and 0.8 (medium confidence = 0.6)
    // 8 corrected + 5 shared = 8*2 + 5 = 21; totalSignals = 13; score = 21 / 23 ~= 0.91 (too high)
    // 3 corrected + 2 shared = 3*2 + 2 = 8; totalSignals = 5; score = 8 / 15 ~= 0.53 (mid-range)
    const signalStmt = db.prepare(`
      INSERT INTO interaction_signals
        (id, user_id, conversation_id, turn_id, signal_type, question_node_ids, time_to_action_ms, reputation_weight)
      VALUES (?, ?, ?, ?, ?, '[]', 100, 1.0)
    `);

    for (let i = 0; i < 3; i++) {
      signalStmt.run(`sig-corr-${i}`, 'user-1', `conv-c-${i}`, `turn-c-${i}`, 'corrected');
    }
    for (let i = 0; i < 2; i++) {
      signalStmt.run(`sig-shared-${i}`, 'user-1', `conv-s-${i}`, `turn-s-${i}`, 'shared');
    }
    // Update stored reputation
    reputationTracker.update('user-1');

    const pair = processCorrection(
      makeCorrection(),
      pairStore,
      reputationTracker,
    );

    expect(pair).not.toBeNull();
    // Mid-range reputation (0.4-0.8) should yield confidence 0.6
    expect(pair!.metadata.confidence).toBe(0.6);
  });

  it('should produce a prompt that is natural language, not a UUID', () => {
    const pair = processCorrection(
      makeCorrection({
        originalQuestion: 'What is our vacation policy?',
      }),
      pairStore,
      reputationTracker,
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toBe('What is our vacation policy?');
    expect(pair!.prompt).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should use default reputation for new users (no signal history)', () => {
    const pair = processCorrection(
      makeCorrection({
        signal: makeSignal({ userId: 'brand-new-user' }),
      }),
      pairStore,
      reputationTracker,
    );

    // Default reputation is 0.5, which is above 0.4 threshold
    expect(pair).not.toBeNull();
    // 0.5 is in medium range (0.4-0.8), so confidence = 0.6
    expect(pair!.metadata.confidence).toBe(0.6);
  });

  it('should export correction-derived pairs via exportDpo', () => {
    processCorrection(makeCorrection(), pairStore, reputationTracker);
    processCorrection(
      makeCorrection({
        signal: makeSignal({ id: 'sig-2', userId: 'user-2' }),
        originalQuestion: 'What is the code review process?',
        originalAnswer: 'We do not review code.',
        correctedAnswer: 'All PRs require two approvals before merge.',
      }),
      pairStore,
      reputationTracker,
    );

    expect(pairStore.countUnexported()).toBe(2);

    const tmpFile = `/tmp/ody-correction-test-${Date.now()}.jsonl`;
    const exported = pairStore.exportDpo(tmpFile);
    expect(exported).toBe(2);
    expect(pairStore.countUnexported()).toBe(0);

    // Clean up
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unlinkSync, existsSync } = require('node:fs') as typeof import('node:fs');
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });
});

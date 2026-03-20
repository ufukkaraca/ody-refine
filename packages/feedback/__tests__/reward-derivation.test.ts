import { describe, it, expect } from 'vitest';
import {
  deriveReward,
  derivePreferencePair,
  generateQuestionFromContent,
  generatePromptFromDetection,
  looksLikeUuid,
} from '../src/reward-derivation.js';
import type { InteractionSignal, ReputationScore } from '../src/types.js';
import type { Detection, KnowledgeNode } from '@useody/platform-core';

function makeSignal(overrides: Partial<InteractionSignal> = {}): InteractionSignal {
  return {
    id: 'sig-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    signalType: 'accepted',
    questionNodeIds: ['node-1'],
    timeToActionMs: 500,
    reputationWeight: 1.0,
    createdAt: new Date('2026-01-01'),
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

describe('deriveReward', () => {
  it('should derive positive reward for accepted signal', () => {
    const reward = deriveReward(makeSignal({ signalType: 'accepted' }), makeReputation());
    expect(reward.rewardType).toBe('positive');
    expect(reward.weight).toBeGreaterThan(0);
    expect(reward.reason).toContain('accepted');
  });

  it('should derive negative reward for rejected signal', () => {
    const reward = deriveReward(makeSignal({ signalType: 'rejected' }), makeReputation());
    expect(reward.rewardType).toBe('negative');
    expect(reward.reason).toContain('rejected');
  });

  it('should derive negative reward for corrected signal', () => {
    const reward = deriveReward(makeSignal({ signalType: 'corrected' }), makeReputation());
    expect(reward.rewardType).toBe('negative');
    expect(reward.weight).toBeGreaterThan(0.5);
  });

  it('should derive positive reward for shared signal', () => {
    const reward = deriveReward(makeSignal({ signalType: 'shared' }), makeReputation());
    expect(reward.rewardType).toBe('positive');
  });

  it('should derive neutral reward for follow_up signal', () => {
    const reward = deriveReward(makeSignal({ signalType: 'follow_up' }), makeReputation());
    expect(reward.rewardType).toBe('neutral');
  });

  it('should factor reputation into weight', () => {
    const highRep = deriveReward(makeSignal(), makeReputation({ score: 1.0 }));
    const lowRep = deriveReward(makeSignal(), makeReputation({ score: 0.1 }));
    expect(highRep.weight).toBeGreaterThan(lowRep.weight);
  });

  it('should clamp weight to 0-1', () => {
    const reward = deriveReward(makeSignal({ signalType: 'corrected' }), makeReputation({ score: 1.5 }));
    expect(reward.weight).toBeLessThanOrEqual(1);
    expect(reward.weight).toBeGreaterThanOrEqual(0);
  });
});

describe('derivePreferencePair', () => {
  it('should use originalQuestion when provided', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1', 'n2'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(
      signal, 'original answer', 'corrected answer', rep,
      'What is the deployment deadline?',
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toBe('What is the deployment deadline?');
    expect(pair!.chosen).toBe('corrected answer');
    expect(pair!.rejected).toBe('original answer');
    expect(pair!.metadata.confidence).toBe(1.0);
    expect(pair!.metadata.resolvedBy).toBe('user-1');
  });

  it('should generate question from nodeContent when no question available', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(
      signal, 'orig', 'fixed', rep,
      undefined,
      'API rate limits for production',
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toContain('What is the current policy on');
    expect(pair!.prompt).toContain('API rate limits');
  });

  it('should return null when no question or content is available (avoids UUID prompts)', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1', 'n2'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(signal, 'orig', 'fixed', rep);

    expect(pair).toBeNull();
  });

  it('should return null when originalQuestion is a UUID', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(
      signal, 'orig', 'fixed', rep,
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );

    expect(pair).toBeNull();
  });

  it('should produce prompt that is natural language, not a UUID', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(
      signal, 'original answer', 'corrected answer', rep,
      'What is the vacation policy?',
    );

    expect(pair).not.toBeNull();
    expect(pair!.prompt).toBe('What is the vacation policy?');
    expect(pair!.prompt).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('should produce chosen/rejected with actual content, not IDs', () => {
    const signal = makeSignal({ signalType: 'corrected', questionNodeIds: ['n1'] });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(
      signal,
      'Employees get 15 days of vacation per year.',
      'Employees receive 20 days of paid vacation, accruing at 1.67 days per month.',
      rep,
      'What is our vacation policy?',
    );

    expect(pair).not.toBeNull();
    expect(pair!.chosen).toContain('20 days');
    expect(pair!.rejected).toContain('15 days');
  });

  it('should give confidence 0.6 for medium reputation (0.4-0.8)', () => {
    const signal = makeSignal({ signalType: 'corrected' });
    const rep = makeReputation({ score: 0.5 });
    const pair = derivePreferencePair(
      signal, 'orig', 'fixed', rep,
      'What is the deployment process?',
    );

    expect(pair).not.toBeNull();
    expect(pair!.metadata.confidence).toBe(0.6);
  });

  it('should return null for low reputation (<0.4)', () => {
    const signal = makeSignal({ signalType: 'corrected' });
    const rep = makeReputation({ score: 0.3 });
    const pair = derivePreferencePair(signal, 'orig', 'fixed', rep);

    expect(pair).toBeNull();
  });

  it('should return null for non-corrected signal types', () => {
    const signal = makeSignal({ signalType: 'accepted' });
    const rep = makeReputation({ score: 0.9 });
    const pair = derivePreferencePair(signal, 'orig', 'fixed', rep);

    expect(pair).toBeNull();
  });
});

describe('generateQuestionFromContent', () => {
  it('should generate a question from content', () => {
    const q = generateQuestionFromContent('API rate limits for production endpoints');
    expect(q).toBe('What is the current policy on API rate limits for production endpoints?');
  });

  it('should truncate long content to 80 chars', () => {
    const longContent = 'A'.repeat(200);
    const q = generateQuestionFromContent(longContent);
    expect(q.length).toBeLessThan(200);
  });

  it('should use first line only', () => {
    const q = generateQuestionFromContent('First line topic\nSecond line detail');
    expect(q).toContain('First line topic');
    expect(q).not.toContain('Second line');
  });
});

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: 'node-1',
    title: 'Vacation Policy',
    content: { summary: 'Employees receive 20 days of paid vacation per year.' },
    embedding: [0.1, 0.2],
    embeddingModel: 'test',
    embeddingDim: 2,
    confidence: 0.9,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'warning',
    nodeIds: ['node-1', 'node-2'],
    description: 'Vacation policy states conflicting day counts',
    ...overrides,
  };
}

describe('generatePromptFromDetection', () => {
  it('should generate prompt from detection description', () => {
    const detection = makeDetection({
      description: 'Vacation policy states conflicting day counts',
    });
    const prompt = generatePromptFromDetection(detection, []);

    expect(prompt).not.toBeNull();
    expect(prompt).toContain('Vacation policy');
    expect(prompt).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('should fall back to node titles when description is empty', () => {
    const detection = makeDetection({ description: '', nodeIds: ['node-1'] });
    const nodes = [makeNode({ id: 'node-1', title: 'Vacation Policy' })];
    const prompt = generatePromptFromDetection(detection, nodes);

    expect(prompt).not.toBeNull();
    expect(prompt).toContain('Vacation Policy');
  });

  it('should fall back to node content summaries', () => {
    const detection = makeDetection({ description: '', nodeIds: ['node-1'] });
    const nodes = [makeNode({
      id: 'node-1',
      title: '',
      content: { summary: 'Rate limits apply to all endpoints' },
    })];
    const prompt = generatePromptFromDetection(detection, nodes);

    expect(prompt).not.toBeNull();
    expect(prompt).toContain('Rate limits');
  });

  it('should return null when no meaningful content is available', () => {
    const detection = makeDetection({ description: '', nodeIds: ['node-99'] });
    const prompt = generatePromptFromDetection(detection, []);

    expect(prompt).toBeNull();
  });
});

describe('looksLikeUuid', () => {
  it('should detect a single UUID', () => {
    expect(looksLikeUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('should detect comma-separated UUIDs', () => {
    expect(looksLikeUuid(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890, b2c3d4e5-f6a7-8901-bcde-f12345678901',
    )).toBe(true);
  });

  it('should not flag natural language', () => {
    expect(looksLikeUuid('What is the vacation policy?')).toBe(false);
  });

  it('should not flag mixed content', () => {
    expect(looksLikeUuid('Policy for node a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });
});

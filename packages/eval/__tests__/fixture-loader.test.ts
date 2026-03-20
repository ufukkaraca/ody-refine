import { describe, it, expect } from 'vitest';
import {
  loadContradictionCorpus,
  loadStalenessCorpus,
  loadPreferencePairs,
  loadForgeEvalQuestions,
  loadBaselineQuestions,
} from '../src/fixture-loader.js';

describe('loadContradictionCorpus', () => {
  it('loads ground truth and nodes', async () => {
    const { groundTruth, nodes } = await loadContradictionCorpus();

    expect(groundTruth.corpus).toBe('contradiction-detection-v1');
    expect(groundTruth.pairs.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThan(0);

    // 10 contradiction pairs + 5 negative = 15 pairs total
    expect(groundTruth.pairs).toHaveLength(15);

    // Each pair has 2 nodes = 30 nodes
    expect(nodes).toHaveLength(30);

    // Check hydration
    const node = nodes[0]!;
    expect(node.id).toBeDefined();
    expect(node.title).toBeDefined();
    expect(node.content.summary).toBeDefined();
    expect(node.createdAt).toBeInstanceOf(Date);
  });

  it('has correct positive/negative split', async () => {
    const { groundTruth } = await loadContradictionCorpus();

    const positives = groundTruth.pairs.filter((p) => p.hasContradiction);
    const negatives = groundTruth.pairs.filter((p) => !p.hasContradiction);

    expect(positives).toHaveLength(10);
    expect(negatives).toHaveLength(5);
  });

  it('covers all required categories', async () => {
    const { groundTruth } = await loadContradictionCorpus();

    const categories = new Set(groundTruth.pairs.map((p) => p.category));
    expect(categories.has('numerical_conflict')).toBe(true);
    expect(categories.has('policy_disagreement')).toBe(true);
    expect(categories.has('timeline_conflict')).toBe(true);
    expect(categories.has('ownership_conflict')).toBe(true);
    expect(categories.has('commitment_conflict')).toBe(true);
    expect(categories.has('no_contradiction')).toBe(true);
  });
});

describe('loadStalenessCorpus', () => {
  it('loads ground truth, nodes, and edges', async () => {
    const { groundTruth, nodes, edges } = await loadStalenessCorpus();

    expect(groundTruth.corpus).toBe('staleness-detection-v1');
    expect(groundTruth.documents.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('has supersedes edges', async () => {
    const { edges } = await loadStalenessCorpus();

    const supersedesEdges = edges.filter((e) => e.type === 'supersedes');
    expect(supersedesEdges.length).toBeGreaterThan(0);

    for (const edge of supersedesEdges) {
      expect(edge.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('loadPreferencePairs', () => {
  it('loads preference pairs from fixtures', async () => {
    const pairs = await loadPreferencePairs();

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]!.prompt).toBeDefined();
    expect(pairs[0]!.chosen).toBeDefined();
    expect(pairs[0]!.rejected).toBeDefined();
    expect(pairs[0]!.metadata.confidence).toBeGreaterThan(0);
  });
});

describe('loadForgeEvalQuestions', () => {
  it('loads evaluation questions', async () => {
    const questions = await loadForgeEvalQuestions();

    expect(questions.length).toBe(10);
    for (const q of questions) {
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.correctAnswer.length).toBeGreaterThan(0);
      expect(q.incorrectAnswer.length).toBeGreaterThan(0);
    }
  });
});

describe('loadBaselineQuestions', () => {
  it('loads beats-baseline questions', async () => {
    const questions = await loadBaselineQuestions();

    expect(questions.length).toBe(10);
    for (const q of questions) {
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.correctAnswer.length).toBeGreaterThan(0);
      expect(q.whyBaselineFails.length).toBeGreaterThan(0);
    }
  });
});

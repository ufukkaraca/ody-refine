/**
 * Contradiction-specific benchmark generation.
 * THE benchmark: tests whether a model correctly resolves contradictory sources.
 * @module eval/contradiction-benchmark
 */

import type { KnowledgeNode, PreferencePair } from '@useody/platform-core';
import type { Benchmark, EvalItem } from './types.js';

/** A contradiction scenario for benchmark evaluation. */
export interface ContradictionScenario {
  question: string;
  correctAnswer: string;
  incorrectAnswer: string;
  sourceNodeIds: string[];
  domain: string;
}

/**
 * Generate a contradiction benchmark from resolved preference pairs.
 * Each pair becomes a test: given contradictory context, does the model
 * pick the version the user chose?
 */
export function generateContradictionBenchmark(
  pairs: PreferencePair[],
  name: string,
): Benchmark {
  const items: EvalItem[] = pairs.map((pair) => ({
    id: crypto.randomUUID(),
    question: buildContradictionPrompt(pair),
    expectedAnswer: pair.chosen,
    domain: pair.metadata.conflictType,
    difficulty: 'hard' as const,
    sourceNodeIds: pair.metadata.sourceNodeIds,
  }));

  return {
    id: crypto.randomUUID(),
    name,
    items,
    datasetVersion: '1.0.0',
    createdAt: new Date(),
  };
}

/**
 * Build a prompt that presents contradictory information and asks for the truth.
 * This is the core of THE benchmark — the model must pick the right version.
 */
function buildContradictionPrompt(pair: PreferencePair): string {
  return [
    'You have access to two documents that contradict each other.',
    '',
    `Document A says: "${pair.chosen}"`,
    `Document B says: "${pair.rejected}"`,
    '',
    `Question: ${pair.prompt}`,
    '',
    'Based on the most reliable and current information, provide the correct answer.',
  ].join('\n');
}

/**
 * Generate contradiction scenarios from knowledge nodes with contradicts edges.
 * For nodes that contradict each other, creates a scenario where one is correct.
 */
export function generateScenariosFromNodes(
  nodes: KnowledgeNode[],
  contradictionPairs: Array<{ nodeA: string; nodeB: string; correctNodeId: string }>,
): ContradictionScenario[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const scenarios: ContradictionScenario[] = [];

  for (const pair of contradictionPairs) {
    const nodeA = nodeMap.get(pair.nodeA);
    const nodeB = nodeMap.get(pair.nodeB);
    if (!nodeA || !nodeB) continue;

    const correct = pair.correctNodeId === pair.nodeA ? nodeA : nodeB;
    const incorrect = pair.correctNodeId === pair.nodeA ? nodeB : nodeA;

    scenarios.push({
      question: `What is the correct information about ${correct.title}?`,
      correctAnswer: correct.content.summary,
      incorrectAnswer: incorrect.content.summary,
      sourceNodeIds: [pair.nodeA, pair.nodeB],
      domain: deriveDomain(correct),
    });
  }

  return scenarios;
}

/** Derive domain from node entities. */
function deriveDomain(node: KnowledgeNode): string {
  const entities = node.content.entities;
  if (entities && entities.length > 0 && entities[0]) {
    return entities[0].type.toLowerCase();
  }
  return 'general';
}

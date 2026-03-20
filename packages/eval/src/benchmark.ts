/**
 * Benchmark generation from knowledge nodes.
 * @module eval/benchmark
 */

import type { KnowledgeNode } from '@useody/platform-core';
import type { Benchmark, EvalItem } from './types.js';

/**
 * Determine difficulty based on fact count.
 * 1-2 = easy, 3-5 = medium, 6+ = hard.
 */
function assignDifficulty(factCount: number): 'easy' | 'medium' | 'hard' {
  if (factCount <= 2) return 'easy';
  if (factCount <= 5) return 'medium';
  return 'hard';
}

/**
 * Derive domain from the first entity type, or 'general' if none.
 */
function deriveDomain(node: KnowledgeNode): string {
  const entities = node.content.entities;
  if (entities && entities.length > 0 && entities[0]) {
    return entities[0].type.toLowerCase();
  }
  return 'general';
}

/**
 * Generate a benchmark from knowledge nodes.
 * Only includes nodes with confidence >= 0.8 and at least one fact.
 */
export function generateBenchmark(
  nodes: KnowledgeNode[],
  name: string,
): Benchmark {
  const items: EvalItem[] = [];

  for (const node of nodes) {
    const facts = node.content.facts ?? [];
    if (node.confidence < 0.8 || facts.length === 0) {
      continue;
    }

    const expectedAnswer = [node.content.summary, ...facts].join(' ');

    items.push({
      id: crypto.randomUUID(),
      question: `What do you know about: ${node.title}?`,
      expectedAnswer,
      domain: deriveDomain(node),
      difficulty: assignDifficulty(facts.length),
      sourceNodeIds: [node.id],
    });
  }

  return {
    id: crypto.randomUUID(),
    name,
    items,
    datasetVersion: '1.0.0',
    createdAt: new Date(),
  };
}

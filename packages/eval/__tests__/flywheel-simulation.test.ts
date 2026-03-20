import { describe, it, expect } from 'vitest';
import { runFlywheelTest } from '../src/flywheel-simulation.js';
import type { FlywheelScenario } from '../src/flywheel-simulation.js';
import type {
  KnowledgeNode,
  Detection,
  DetectorFn,
} from '@useody/platform-core';

function makeNode(id: string, title: string, summary: string): KnowledgeNode {
  return {
    id, title,
    content: { summary, facts: [summary], raw: summary },
    embedding: [], embeddingModel: 'test', embeddingDim: 0,
    confidence: 0.9, createdAt: new Date(), updatedAt: new Date(),
  };
}

function makeDetector(findings: Detection[]): DetectorFn {
  const fn: DetectorFn = async (): Promise<Detection[]> => findings;
  fn.preFilter = { similarityThreshold: 0.6, topK: 10 };
  return fn;
}

describe('runFlywheelSimulation', () => {
  const nodes = [
    makeNode('a', 'Remote Policy', 'We are remote-first'),
    makeNode('b', 'Office Policy', 'Must be in office 3 days'),
  ];

  const scenario: FlywheelScenario = {
    nodes,
    edges: [],
    expectedContradictions: 1,
    resolutions: [
      {
        prompt: 'What is the work policy?',
        chosen: 'Remote-first with no mandatory office days.',
        rejected: 'Must be in office 3 days per week.',
        chosenNodeId: 'a',
      },
    ],
    answerQuestions: [
      {
        question: 'Can I work remotely?',
        expectedKeywords: 'remote-first mandatory office days',
      },
    ],
  };

  it('passes when detector finds enough contradictions', async () => {
    const detector = makeDetector([{
      type: 'contradiction', severity: 'warning',
      nodeIds: ['a', 'b'], description: 'policy conflict',
    }]);

    const result = await runFlywheelTest(scenario, detector);

    expect(result.stages).toHaveLength(3);
    expect(result.stages[0]!.stage).toBe('detect');
    expect(result.stages[0]!.passed).toBe(true);
    expect(result.stages[1]!.stage).toBe('resolve');
    expect(result.stages[1]!.passed).toBe(true);
    expect(result.stages[2]!.stage).toBe('answer');
    expect(result.passed).toBe(true);
  });

  it('fails detect stage when no contradictions found', async () => {
    const detector = makeDetector([]);

    const result = await runFlywheelTest(scenario, detector);

    expect(result.stages[0]!.passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('records timing for each stage', async () => {
    const detector = makeDetector([{
      type: 'contradiction', severity: 'warning',
      nodeIds: ['a', 'b'], description: 'test',
    }]);

    const result = await runFlywheelTest(scenario, detector);

    for (const stage of result.stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles empty scenario', async () => {
    const emptyScenario: FlywheelScenario = {
      nodes: [],
      edges: [],
      expectedContradictions: 0,
      resolutions: [],
      answerQuestions: [],
    };

    const detector = makeDetector([]);
    const result = await runFlywheelTest(emptyScenario, detector);

    expect(result.stages).toHaveLength(3);
    expect(result.stages[0]!.passed).toBe(true); // 0 >= 0
    expect(result.stages[1]!.passed).toBe(true); // valid (empty)
  });
});

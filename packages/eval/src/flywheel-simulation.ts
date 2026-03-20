/**
 * End-to-end flywheel STRUCTURAL simulation.
 * This is a STRUCTURAL simulation. It proves interfaces connect.
 * It does NOT prove the full pipeline works with real models.
 * Validates: Refine detect -> resolve -> Forge pairs -> Colleague answer.
 * Forge training is validated structurally (pair format), not actually trained.
 * @module eval/flywheel-simulation
 */

import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  PreferencePair,
  LLMProvider,
  DetectorFn,
} from '@useody/platform-core';
import { validatePreferencePairs } from './preference-pair-validator.js';
import { calculateAccuracy } from './metrics.js';

/** Configuration for a flywheel test scenario. */
export interface FlywheelScenario {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  expectedContradictions: number;
  resolutions: Array<{
    prompt: string;
    chosen: string;
    rejected: string;
    chosenNodeId: string;
  }>;
  answerQuestions: Array<{
    question: string;
    expectedKeywords: string;
  }>;
}

/** Result of a single flywheel stage. */
export interface StageResult {
  stage: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

/** Full flywheel test result. */
export interface FlywheelResult {
  passed: boolean;
  stages: StageResult[];
  totalDurationMs: number;
}

/**
 * Run the detect stage: run contradiction detector and verify finding count.
 */
async function runDetectStage(
  detector: DetectorFn,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  expectedCount: number,
  llm?: LLMProvider,
): Promise<{ result: StageResult; detections: Detection[] }> {
  const start = performance.now();
  const detections = await detector(nodes, edges, llm);
  const contradictions = detections.filter((d) => d.type === 'contradiction');
  const durationMs = performance.now() - start;

  const passed = contradictions.length >= expectedCount;
  return {
    result: {
      stage: 'detect',
      passed,
      details: `Found ${contradictions.length} contradictions (expected >= ${expectedCount})`,
      durationMs,
    },
    detections: contradictions,
  };
}

/**
 * Run the resolve stage: convert resolutions to preference pairs.
 */
function runResolveStage(
  resolutions: FlywheelScenario['resolutions'],
): { result: StageResult; pairs: PreferencePair[] } {
  const start = performance.now();

  const pairs: PreferencePair[] = resolutions.map((r) => ({
    prompt: r.prompt,
    chosen: r.chosen,
    rejected: r.rejected,
    metadata: {
      conflictType: 'contradiction' as const,
      resolvedBy: 'flywheel-test',
      resolvedAt: new Date(),
      confidence: 1.0,
      sourceNodeIds: [r.chosenNodeId],
    },
  }));

  const validation = validatePreferencePairs(pairs);
  const durationMs = performance.now() - start;

  return {
    result: {
      stage: 'resolve',
      passed: validation.valid,
      details: `Created ${pairs.length} preference pairs, ${validation.validPairs} valid`,
      durationMs,
    },
    pairs,
  };
}

/**
 * Run the answer stage: ask questions and check answers against expected keywords.
 * Uses LLM if available; otherwise uses keyword matching against resolved truths.
 */
async function runAnswerStage(
  questions: FlywheelScenario['answerQuestions'],
  pairs: PreferencePair[],
  llm?: LLMProvider,
): Promise<StageResult> {
  const start = performance.now();

  let correctCount = 0;
  for (const q of questions) {
    if (llm) {
      const context = pairs
        .map((p) => `Q: ${p.prompt}\nA: ${p.chosen}`)
        .join('\n\n');
      const answer = await llm.complete([
        { role: 'system', content: `Answer using this context:\n${context}` },
        { role: 'user', content: q.question },
      ]);
      const accuracy = calculateAccuracy(q.expectedKeywords, answer);
      if (accuracy >= 0.3) correctCount++;
    } else {
      // Without LLM, check if any resolved pair covers the question
      const covered = pairs.some((p) => {
        const accuracy = calculateAccuracy(q.expectedKeywords, p.chosen);
        return accuracy >= 0.3;
      });
      if (covered) correctCount++;
    }
  }

  const durationMs = performance.now() - start;
  const passed = correctCount >= questions.length * 0.5;

  return {
    stage: 'answer',
    passed,
    details: `${correctCount}/${questions.length} questions answered correctly`,
    durationMs,
  };
}

/**
 * Run the full flywheel test: detect -> resolve -> answer.
 * Forge training is validated structurally (pair format), not actually trained.
 */
export async function runFlywheelTest(
  scenario: FlywheelScenario,
  detector: DetectorFn,
  llm?: LLMProvider,
): Promise<FlywheelResult> {
  const stages: StageResult[] = [];

  // Stage 1: Detect
  const { result: detectResult } = await runDetectStage(
    detector, scenario.nodes, scenario.edges,
    scenario.expectedContradictions, llm,
  );
  stages.push(detectResult);

  // Stage 2: Resolve
  const { result: resolveResult, pairs } = runResolveStage(
    scenario.resolutions,
  );
  stages.push(resolveResult);

  // Stage 3: Answer (Colleague simulation)
  const answerResult = await runAnswerStage(
    scenario.answerQuestions, pairs, llm,
  );
  stages.push(answerResult);

  const totalDurationMs = stages.reduce((s, st) => s + st.durationMs, 0);
  const passed = stages.every((s) => s.passed);

  return { passed, stages, totalDurationMs };
}

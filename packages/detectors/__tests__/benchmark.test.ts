import { describe, it, expect, vi } from 'vitest';
import type {
  KnowledgeNode,
  Detection,
  LLMProvider,
} from '@useody/platform-core';
import {
  computeMetrics,
  evaluateGate,
  runBenchmark,
} from '../src/benchmark.js';
import type {
  GroundTruthEntry,
  BenchmarkCorpus,
  BenchmarkResult,
  BenchmarkApproach,
} from '../src/benchmark.js';

function makeNode(id: string, title: string): KnowledgeNode {
  return {
    id,
    title,
    content: {
      summary: `Summary of ${title}`,
      facts: [`fact about ${title}`],
      entities: [{ name: title.toLowerCase(), type: 'topic' }],
      source: { sourceType: 'notion', sourceId: `src-${id}` },
    },
    embedding: [0.1],
    embeddingModel: 'test',
    embeddingDim: 1,
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDetection(idA: string, idB: string): Detection {
  return {
    type: 'contradiction',
    severity: 'warning',
    nodeIds: [idA, idB],
    description: `Contradiction between ${idA} and ${idB}`,
  };
}

function makeMockLlm(): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue('[]'),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('mock-model'),
  };
}

describe('benchmark', () => {
  describe('computeMetrics', () => {
    it('returns perfect scores when all contradictions are detected', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
        { nodeIdA: 'c', nodeIdB: 'd', isContradiction: true },
      ];
      const detections = [makeDetection('a', 'b'), makeDetection('c', 'd')];
      const m = computeMetrics(detections, groundTruth);
      expect(m.precision).toBe(1);
      expect(m.recall).toBe(1);
      expect(m.f1).toBe(1);
    });

    it('handles partial detection (some missed)', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
        { nodeIdA: 'c', nodeIdB: 'd', isContradiction: true },
      ];
      const detections = [makeDetection('a', 'b')];
      const m = computeMetrics(detections, groundTruth);
      expect(m.precision).toBe(1);
      expect(m.recall).toBe(0.5);
      expect(m.f1).toBeCloseTo(2 / 3);
    });

    it('handles false positives', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
        { nodeIdA: 'c', nodeIdB: 'd', isContradiction: false },
      ];
      const detections = [makeDetection('a', 'b'), makeDetection('c', 'd')];
      const m = computeMetrics(detections, groundTruth);
      expect(m.precision).toBe(0.5);
      expect(m.recall).toBe(1);
      expect(m.f1).toBeCloseTo(2 / 3);
    });

    it('returns zero for no detections', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
      ];
      const m = computeMetrics([], groundTruth);
      expect(m.precision).toBe(0);
      expect(m.recall).toBe(0);
      expect(m.f1).toBe(0);
    });

    it('returns zero for no ground truth positives', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'a', nodeIdB: 'b', isContradiction: false },
      ];
      const detections = [makeDetection('a', 'b')];
      const m = computeMetrics(detections, groundTruth);
      expect(m.precision).toBe(0);
      expect(m.recall).toBe(0);
      expect(m.f1).toBe(0);
    });

    it('handles reversed pair order via pairKey canonicalization', () => {
      const groundTruth: GroundTruthEntry[] = [
        { nodeIdA: 'b', nodeIdB: 'a', isContradiction: true },
      ];
      const detections = [makeDetection('a', 'b')];
      const m = computeMetrics(detections, groundTruth);
      expect(m.recall).toBe(1);
    });
  });

  describe('evaluateGate', () => {
    function makeResult(
      approach: string,
      precision: number,
      recall: number,
      f1: number,
    ): BenchmarkResult {
      return { approach, precision, recall, f1, detections: [], durationMs: 0 };
    }

    it('passes when C meets all criteria', () => {
      const results = [
        makeResult('current-pipeline', 0.5, 0.8, 0.6),
        makeResult('raw-llm', 0.9, 0.5, 0.64),
        makeResult('llm-augmented', 0.92, 0.85, 0.88),
      ];
      const gate = evaluateGate(results);
      expect(gate.passesGate).toBe(true);
      expect(gate.gateDetails).toContain('PASS');
    });

    it('fails when C.precision < B.precision', () => {
      const results = [
        makeResult('current-pipeline', 0.5, 0.8, 0.6),
        makeResult('raw-llm', 0.95, 0.5, 0.66),
        makeResult('llm-augmented', 0.9, 0.85, 0.87),
      ];
      const gate = evaluateGate(results);
      expect(gate.passesGate).toBe(false);
      expect(gate.gateDetails).toContain('FAIL: C.precision >= B.precision');
    });

    it('fails when C.recall < A.recall', () => {
      const results = [
        makeResult('current-pipeline', 0.5, 0.9, 0.64),
        makeResult('raw-llm', 0.8, 0.5, 0.62),
        makeResult('llm-augmented', 0.85, 0.7, 0.77),
      ];
      const gate = evaluateGate(results);
      expect(gate.passesGate).toBe(false);
      expect(gate.gateDetails).toContain('FAIL: C.recall >= A.recall');
    });

    it('fails when C.F1 is not strictly greater than max(A, B)', () => {
      const results = [
        makeResult('current-pipeline', 0.5, 0.8, 0.62),
        makeResult('raw-llm', 0.9, 0.5, 0.64),
        makeResult('llm-augmented', 0.9, 0.8, 0.64),
      ];
      const gate = evaluateGate(results);
      expect(gate.passesGate).toBe(false);
      expect(gate.gateDetails).toContain('FAIL: C.F1 > max(A.F1, B.F1)');
    });

    it('returns failure with details when approaches are missing', () => {
      const gate = evaluateGate([
        makeResult('current-pipeline', 0.5, 0.8, 0.6),
      ]);
      expect(gate.passesGate).toBe(false);
      expect(gate.gateDetails).toContain('Missing required approaches');
    });
  });

  describe('runBenchmark', () => {
    it('orchestrates approaches and evaluates gate', async () => {
      const corpus: BenchmarkCorpus = {
        nodes: [makeNode('a', 'Doc A'), makeNode('b', 'Doc B')],
        edges: [],
        groundTruth: [
          { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
        ],
      };

      const mockApproaches: BenchmarkApproach[] = [
        {
          name: 'current-pipeline',
          run: vi.fn().mockResolvedValue([makeDetection('a', 'b')]),
        },
        {
          name: 'raw-llm',
          run: vi.fn().mockResolvedValue([makeDetection('a', 'b')]),
        },
        {
          name: 'llm-augmented',
          run: vi.fn().mockResolvedValue([makeDetection('a', 'b')]),
        },
      ];

      const llm = makeMockLlm();
      const report = await runBenchmark(corpus, llm, mockApproaches);

      expect(report.results).toHaveLength(3);
      for (const r of report.results) {
        expect(r.precision).toBe(1);
        expect(r.recall).toBe(1);
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
      }
      // All equal F1 means C.F1 is NOT strictly greater, so gate fails
      expect(report.passesGate).toBe(false);
    });

    it('passes gate when augmented outperforms others', async () => {
      const corpus: BenchmarkCorpus = {
        nodes: [
          makeNode('a', 'Doc A'),
          makeNode('b', 'Doc B'),
          makeNode('c', 'Doc C'),
        ],
        edges: [],
        groundTruth: [
          { nodeIdA: 'a', nodeIdB: 'b', isContradiction: true },
          { nodeIdA: 'a', nodeIdB: 'c', isContradiction: true },
        ],
      };

      const mockApproaches: BenchmarkApproach[] = [
        {
          name: 'current-pipeline',
          run: vi.fn().mockResolvedValue([makeDetection('a', 'b')]),
        },
        {
          name: 'raw-llm',
          run: vi.fn().mockResolvedValue([makeDetection('a', 'c')]),
        },
        {
          name: 'llm-augmented',
          run: vi.fn().mockResolvedValue([
            makeDetection('a', 'b'),
            makeDetection('a', 'c'),
          ]),
        },
      ];

      const llm = makeMockLlm();
      const report = await runBenchmark(corpus, llm, mockApproaches);

      expect(report.passesGate).toBe(true);
      expect(report.gateDetails).not.toContain('FAIL');

      const augResult = report.results.find(
        (r) => r.approach === 'llm-augmented',
      );
      expect(augResult?.precision).toBe(1);
      expect(augResult?.recall).toBe(1);
    });
  });
});

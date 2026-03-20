import { describe, it, expect, vi } from 'vitest';
import { runDetection } from '../src/loader.js';
import type {
  Detection,
  DetectorFn,
  KnowledgeEdge,
  KnowledgeNode,
  NodeRepository,
  EdgeRepository,
  VectorIndex,
  SearchResult,
  NodeFilter,
  EdgeType,
} from '../src/types.js';

function makeNode(id: string, embedding: number[] = [1, 0, 0, 0]): KnowledgeNode {
  return {
    id,
    title: `Node ${id}`,
    content: { summary: `Summary ${id}` },
    embedding,
    embeddingModel: 'test',
    embeddingDim: 4,
    confidence: 1.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(sourceId: string, targetId: string): KnowledgeEdge {
  return {
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    type: 'related',
    reason: 'test',
    confidence: 1.0,
  };
}

function createMockRepos(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): { nodeRepo: NodeRepository; edgeRepo: EdgeRepository } {
  const nodeRepo: NodeRepository = {
    upsert: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(async (_filter?: NodeFilter) => nodes),
    delete: vi.fn(),
    count: vi.fn(async () => nodes.length),
  };
  const edgeRepo: EdgeRepository = {
    upsert: vi.fn(),
    findByNodeId: vi.fn(),
    findByType: vi.fn(async (_type: EdgeType) => edges),
    findAll: vi.fn(async () => edges),
    delete: vi.fn(),
  };
  return { nodeRepo, edgeRepo };
}

function createMockVecIndex(results: SearchResult[] = []): VectorIndex {
  return {
    add: vi.fn(),
    search: vi.fn(async () => results),
    remove: vi.fn(),
    count: vi.fn(async () => 0),
  };
}

function makeDetector(
  name: string,
  requireAllNodes: boolean,
  detections: Detection[],
): DetectorFn {
  const fn = vi.fn(async () => detections) as unknown as DetectorFn;
  Object.defineProperty(fn, 'name', { value: name });
  fn.preFilter = {
    similarityThreshold: 0.5,
    topK: 5,
    requireAllNodes,
  };
  return fn;
}

describe('runDetection', () => {
  it('passes all nodes when requireAllNodes is true', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const { nodeRepo, edgeRepo } = createMockRepos(nodes, edges);
    const vecIndex = createMockVecIndex();
    const detection: Detection = {
      type: 'contradiction',
      severity: 'warning',
      nodeIds: ['a', 'b'],
      description: 'test',
    };
    const detector = makeDetector('allNodes', true, [detection]);

    const result = await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [detector],
    });

    expect(detector).toHaveBeenCalledWith(nodes, edges, undefined);
    expect(result.detections).toHaveLength(1);
    expect(result.stats).toHaveLength(1);
    expect(result.stats[0]!.detectorName).toBe('allNodes');
    expect(result.stats[0]!.nodeCount).toBe(2);
    expect(result.stats[0]!.detectionCount).toBe(1);
  });

  it('filters candidates via vecIndex when requireAllNodes is false', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b')];
    const { nodeRepo, edgeRepo } = createMockRepos(nodes, edges);
    // vecIndex returns only 'b' as a search result for any query
    const vecIndex = createMockVecIndex([{ id: 'b', distance: 0.1 }]);
    const detector = makeDetector('filtered', false, []);

    await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [detector],
    });

    // Each node searches vecIndex, collecting union of candidate IDs
    // All 3 nodes are included (they add themselves) plus 'b' from search
    expect(detector).toHaveBeenCalled();
    const calledNodes = (detector as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as KnowledgeNode[];
    // All nodes add themselves + vecIndex returns 'b', so all 3 should be present
    expect(calledNodes.length).toBe(3);
  });

  it('records timing stats', async () => {
    const { nodeRepo, edgeRepo } = createMockRepos([], []);
    const vecIndex = createMockVecIndex();
    const detector = makeDetector('timed', true, []);

    const result = await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [detector],
    });

    expect(result.stats).toHaveLength(1);
    expect(result.stats[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls onProgress callback', async () => {
    const { nodeRepo, edgeRepo } = createMockRepos([], []);
    const vecIndex = createMockVecIndex();
    const detector = makeDetector('progress', true, []);
    const onProgress = vi.fn();

    await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [detector],
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith('progress', 'started');
    expect(onProgress).toHaveBeenCalledWith('progress', 'completed');
  });

  it('aggregates detections from multiple detectors', async () => {
    const { nodeRepo, edgeRepo } = createMockRepos([makeNode('x')], []);
    const vecIndex = createMockVecIndex();
    const d1: Detection = {
      type: 'contradiction',
      severity: 'critical',
      nodeIds: ['x'],
      description: 'issue 1',
    };
    const d2: Detection = {
      type: 'staleness',
      severity: 'info',
      nodeIds: ['x'],
      description: 'issue 2',
    };
    const det1 = makeDetector('det1', true, [d1]);
    const det2 = makeDetector('det2', true, [d2]);

    const result = await runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      detectors: [det1, det2],
    });

    expect(result.detections).toHaveLength(2);
    expect(result.stats).toHaveLength(2);
  });
});

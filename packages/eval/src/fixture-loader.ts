/**
 * Loads evaluation fixture files from the fixtures/ directory.
 * Hydrates raw JSON into typed KnowledgeNode/Edge objects.
 * @module eval/fixture-loader
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeNode, KnowledgeEdge } from '@useody/platform-core';
import type {
  ContradictionGroundTruth,
  FixtureNode,
  FixtureEdge,
  StalenessGroundTruth,
  FixturePreferencePair,
  ForgeEvalQuestion,
  BaselineQuestion,
} from './corpus-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

/** Read and parse a JSON fixture file. */
async function readFixture<T>(path: string): Promise<T> {
  const content = await readFile(resolve(FIXTURES_DIR, path), 'utf-8');
  return JSON.parse(content) as T;
}

/** Convert a raw fixture node to a KnowledgeNode (adds defaults for missing fields). */
function hydrateNode(raw: FixtureNode): KnowledgeNode {
  return {
    id: raw.id,
    title: raw.title,
    content: {
      summary: raw.content.summary,
      facts: raw.content.facts,
      entities: raw.content.entities,
      raw: raw.content.raw,
      source: raw.content.source
        ? {
            sourceType: raw.content.source.sourceType,
            sourceId: raw.content.source.sourceId,
            lastModified: raw.content.source.lastModified
              ? new Date(raw.content.source.lastModified)
              : undefined,
          }
        : undefined,
    },
    embedding: [],
    embeddingModel: 'fixture',
    embeddingDim: 0,
    confidence: raw.confidence,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Convert a raw fixture edge to a KnowledgeEdge. */
function hydrateEdge(raw: FixtureEdge): KnowledgeEdge {
  return {
    id: raw.id,
    sourceId: raw.sourceId,
    targetId: raw.targetId,
    type: raw.type as KnowledgeEdge['type'],
    reason: raw.reason,
    confidence: raw.confidence,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
  };
}

/** Load contradiction corpus ground truth and nodes. */
export async function loadContradictionCorpus(): Promise<{
  groundTruth: ContradictionGroundTruth;
  nodes: KnowledgeNode[];
}> {
  const [groundTruth, rawNodes] = await Promise.all([
    readFixture<ContradictionGroundTruth>('contradiction-corpus/ground-truth.json'),
    readFixture<FixtureNode[]>('contradiction-corpus/nodes.json'),
  ]);
  return { groundTruth, nodes: rawNodes.map(hydrateNode) };
}

/** Load staleness corpus ground truth, nodes, and edges. */
export async function loadStalenessCorpus(): Promise<{
  groundTruth: StalenessGroundTruth;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}> {
  const [groundTruth, rawNodes, rawEdges] = await Promise.all([
    readFixture<StalenessGroundTruth>('staleness-corpus/ground-truth.json'),
    readFixture<FixtureNode[]>('staleness-corpus/nodes.json'),
    readFixture<FixtureEdge[]>('staleness-corpus/edges.json'),
  ]);
  return {
    groundTruth,
    nodes: rawNodes.map(hydrateNode),
    edges: rawEdges.map(hydrateEdge),
  };
}

/** Load preference pairs from fixtures. */
export async function loadPreferencePairs(): Promise<FixturePreferencePair[]> {
  return readFixture<FixturePreferencePair[]>('preference-pairs/pairs.json');
}

/** Load forge evaluation questions. */
export async function loadForgeEvalQuestions(): Promise<ForgeEvalQuestion[]> {
  return readFixture<ForgeEvalQuestion[]>('forge-eval-questions/questions.json');
}

/** Load beats-baseline questions. */
export async function loadBaselineQuestions(): Promise<BaselineQuestion[]> {
  const data = await readFixture<{ questions: BaselineQuestion[] }>(
    'beats-baseline/questions.json',
  );
  return data.questions;
}

export { hydrateNode, hydrateEdge, readFixture, FIXTURES_DIR };

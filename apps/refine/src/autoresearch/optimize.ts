/**
 * Autoresearch optimization loop — inspired by Karpathy's autoresearch.
 * Iteratively tunes detector configs to maximize F1 against ground truth.
 * @module autoresearch/optimize
 */
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { Detection, LLMProvider } from '@useody/platform-core';
import type { GroundTruth, ScoreResult } from './ground-truth.js';
import { scoreDetections } from './ground-truth.js';
import type { DetectorConfig } from './config-space.js';
import { DEFAULT_DETECTOR_CONFIG, clampConfig } from './config-space.js';
import { proposeConfigChanges } from './proposer.js';

/** Configuration for the optimization loop. */
export interface OptimizeConfig {
  /** Directory of docs with known issues. */
  testCorpusPath: string;
  /** Labeled correct findings. */
  groundTruth: GroundTruth[];
  /** Maximum optimization iterations (default 20). */
  maxIterations: number;
  /** Timeout per run in ms (default 60000). */
  timeoutPerRun: number;
  /** LLM for generating config variations. */
  llm: LLMProvider;
  /** Optional callback for progress. */
  onProgress?: (iteration: number, score: ScoreResult, improved: boolean) => void;
}

/** Result of a single optimization iteration. */
export interface IterationResult {
  iteration: number;
  config: DetectorConfig;
  score: ScoreResult;
  improved: boolean;
  durationMs: number;
  detectionCount: number;
}

/** Final optimization result. */
export interface OptimizeResult {
  bestPrecision: number;
  bestRecall: number;
  bestF1: number;
  iterations: IterationResult[];
  bestConfig: DetectorConfig;
}

/**
 * Run the autoresearch optimization loop.
 *
 * 1. Run Refine on test corpus with current config
 * 2. Compare detections against ground truth
 * 3. Calculate precision, recall, F1
 * 4. Use LLM to propose config changes
 * 5. Apply changes, re-run, measure
 * 6. Keep if F1 improves, revert if not
 * 7. Repeat for N iterations
 */
export async function optimize(config: OptimizeConfig): Promise<OptimizeResult> {
  const { testCorpusPath, groundTruth, maxIterations, llm, onProgress } = config;
  const absCorpus = resolve(testCorpusPath);

  if (!existsSync(absCorpus)) {
    throw new Error(`Corpus directory not found: ${absCorpus}`);
  }

  let currentConfig = { ...DEFAULT_DETECTOR_CONFIG };
  const iterations: IterationResult[] = [];
  let bestF1 = -1;
  let bestConfig = currentConfig;

  for (let i = 0; i < maxIterations; i++) {
    const start = Date.now();

    const detections = await runDetectorsWithConfig(
      absCorpus,
      currentConfig,
      config.timeoutPerRun,
    );

    const score = scoreDetections(detections, groundTruth);
    const improved = score.f1 > bestF1;

    if (improved) {
      bestF1 = score.f1;
      bestConfig = { ...currentConfig };
    }

    const iterResult: IterationResult = {
      iteration: i + 1,
      config: { ...currentConfig },
      score,
      improved,
      durationMs: Date.now() - start,
      detectionCount: detections.length,
    };
    iterations.push(iterResult);

    onProgress?.(i + 1, score, improved);

    // Early exit if perfect score
    if (score.f1 >= 1.0) break;

    // Propose next config via LLM
    const proposed = await proposeConfigChanges(
      llm,
      currentConfig,
      score,
      iterations.slice(-5), // last 5 iterations for context
    );

    // If improved, explore from here; if not, revert to best and try again
    currentConfig = clampConfig(improved ? proposed : await proposeConfigChanges(
      llm,
      bestConfig,
      score,
      iterations.slice(-5),
    ));
  }

  return {
    bestPrecision: iterations.reduce((m, it) => Math.max(m, it.score.precision), 0),
    bestRecall: iterations.reduce((m, it) => Math.max(m, it.score.recall), 0),
    bestF1,
    iterations,
    bestConfig,
  };
}

/**
 * Run detectors with a given config on a corpus.
 * Creates a temporary DB, ingests, detects, and returns detections.
 */
async function runDetectorsWithConfig(
  corpusPath: string,
  detConfig: DetectorConfig,
  _timeoutMs: number,
): Promise<Detection[]> {
  const core = await import('@useody/platform-core');
  const detectorsMod = await import('@useody/detectors');

  const tmpDir = resolve(corpusPath, '..', '.ody-autoresearch');
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = resolve(tmpDir, 'autoresearch.db');

  // Get embedding provider to determine dimension
  const embProvider = await getEmbeddingProvider();
  const dim = embProvider?.getDimension() ?? 384;

  const db = core.openDatabase(dbPath);
  core.createSchema(db, dim);

  const nodeRepo = new core.SQLiteNodeRepository(db);
  const edgeRepo = new core.SQLiteEdgeRepository(db);
  const vecIndex = new core.SqliteVecIndex(db, dim);

  // Check if nodes exist — if not, ingest the corpus first
  const nodeCount = await nodeRepo.count();
  if (nodeCount === 0) {
    const { ingestDirectory } = await import('../ingest/pipeline.js');
    const { SQLiteIngestLog } = await import('../ingest/ingest-log.js');
    const ingestLog = new SQLiteIngestLog(db as never);

    if (embProvider) {
      await ingestDirectory({
        directory: corpusPath,
        nodeRepo,
        edgeRepo,
        vecIndex,
        embeddingProvider: embProvider,
        ingestLog,
      });
    }
  }

  // Apply config thresholds to detectors
  const detectors = [
    applyPreFilter(detectorsMod.detectContradictions, detConfig.contradictions),
    applyPreFilter(detectorsMod.detectDuplicates, detConfig.duplicates),
    applyPreFilter(detectorsMod.detectStaleness, detConfig.staleness),
    applyPreFilter(detectorsMod.detectUndocumented, detConfig.undocumented),
    applyPreFilter(detectorsMod.detectTimeBombs, detConfig.timeBombs),
  ];

  const result = await core.runDetection({
    nodeRepo,
    edgeRepo,
    vecIndex,
    detectors,
  });

  try { db.close(); } catch { /* ignore */ }

  return result.detections;
}

/** Get an embedding provider from auto-detection. */
async function getEmbeddingProvider(): Promise<import('@useody/platform-core').EmbeddingProvider | null> {
  const { loadConfig } = await import('../config/index.js');
  const { detectEmbeddingProvider } = await import('../config/auto-detect.js');
  const config = loadConfig();
  return detectEmbeddingProvider(config);
}

/** Clone a detector function with modified preFilter config. */
function applyPreFilter(
  detector: import('@useody/platform-core').DetectorFn,
  config: import('@useody/platform-core').PreFilterConfig & { maxLlmCalls?: number },
): import('@useody/platform-core').DetectorFn {
  const wrapped = (async (...args: Parameters<typeof detector>) =>
    detector(...args)) as import('@useody/platform-core').DetectorFn;
  wrapped.preFilter = {
    similarityThreshold: config.similarityThreshold,
    topK: config.topK,
    requireAllNodes: config.requireAllNodes,
  };
  return wrapped;
}

/**
 * Helper functions for the full pipeline orchestrator.
 * Extracted from run-pipeline.ts to keep files under 250 lines.
 * @module run-pipeline-helpers
 */
import { basename, dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { LLMProvider } from '@useody/platform-core';

/** Batch size for embeddings — used to decide whether to show chunk-level progress. */
const EMBED_BATCH_SIZE = 32;

/** Consensus strategy determined by document count. */
export interface ConsensusStrategy {
  enabled: boolean;
  minVotes?: number;
  reason?: string;
}

/** Thresholds for auto-adjusting consensus behavior. */
const SMALL_DOC_THRESHOLD = 10;
const MEDIUM_DOC_THRESHOLD = 20;
const RELAXED_FILE_THRESHOLD = 15;
const DENSE_FILE_THRESHOLD = 20;
const DENSE_NODE_THRESHOLD = 100;

/**
 * Determine consensus strategy based on node count and file count.
 * - explicit override (--consensus / --no-consensus) takes priority
 * - < 10 nodes: disable consensus (too aggressive for tiny sets)
 * - < 15 files: relaxed consensus (minVotes=1) — medium sets where
 *   LLM inconsistency filters legitimate findings
 * - < 20 files AND > 100 nodes: relaxed consensus (dense docs)
 * - 10-20 nodes: relaxed consensus (minVotes=1)
 * - > 20 nodes with >= 20 files: default consensus (majority voting)
 */
export function determineConsensusStrategy(
  nodeCount: number,
  explicitConsensus?: boolean,
  fileCount?: number,
): ConsensusStrategy {
  if (explicitConsensus === false) {
    return { enabled: false };
  }
  if (explicitConsensus === true) {
    return { enabled: true };
  }
  if (nodeCount < SMALL_DOC_THRESHOLD) {
    return {
      enabled: false,
      reason: `Small doc set (${String(nodeCount)} nodes) — skipping consensus`,
    };
  }
  // Relaxed consensus for medium-sized sets: fewer than 15 files, or
  // fewer than 20 files with dense content (>100 nodes). Avoids
  // filtering legitimate findings due to LLM inconsistency across passes.
  if (fileCount !== undefined && (fileCount < RELAXED_FILE_THRESHOLD || (fileCount < DENSE_FILE_THRESHOLD && nodeCount > DENSE_NODE_THRESHOLD))) {
    return {
      enabled: true,
      minVotes: 1,
      reason: `Medium doc set (${String(fileCount)} files, ${String(nodeCount)} nodes) — using relaxed consensus`,
    };
  }
  if (nodeCount <= MEDIUM_DOC_THRESHOLD) {
    return {
      enabled: true,
      minVotes: 1,
      reason: `Small doc set (${String(nodeCount)} nodes) — using relaxed consensus`,
    };
  }
  return { enabled: true };
}

/**
 * Verify LLM is responsive with a fast warmup call (30s timeout).
 * Throws on failure.
 */
export async function warmupLlm(
  llm: LLMProvider,
  spinner: { text: string; fail: (msg: string) => void },
): Promise<void> {
  spinner.text = `Warming up ${llm.getModelId()}...`;
  const warmup = llm.complete(
    [{ role: 'user', content: 'Say "ok".' }],
    { temperature: 0, maxTokens: 4 },
  );
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error('LLM warmup timed out after 30s')), 30_000);
  });
  await Promise.race([warmup, timeout]);
}

/** Get CLI version from package.json. */
export function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, '..', 'package.json'), 'utf-8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch { return '0.1.0'; }
}

/** Print startup banner with version. */
export function printBanner(): void {
  process.stdout.write(`\n  ${chalk.bold('ody refine')} ${chalk.dim(`v${getVersion()}`)}\n\n`);
}

/** Show welcome message on first run (no prior data directory). */
export function printFirstRunMessage(dataDir: string): void {
  if (!existsSync(dataDir)) {
    process.stdout.write(
      chalk.cyan('  First scan! ') +
      'Ody Refine will analyze your docs for contradictions, staleness, and drift.\n\n',
    );
  }
}

/** Print per-phase timing summary. */
export function printTimingSummary(ingestSecs: number, detectSecs: number): void {
  const total = ingestSecs + detectSecs;
  process.stdout.write(
    `\n  ${chalk.dim(`Ingestion: ${String(ingestSecs)}s  |  Detection: ${String(detectSecs)}s  |  Total: ${String(total)}s`)}\n`,
  );
}

/** Handle pipeline errors with actionable messages. */
export function handlePipelineError(
  spinner: { fail: (msg: string) => void },
  error: unknown,
): void {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('authentication/quota error') || msg.includes('Invalid API key')) {
    spinner.fail(`LLM authentication failed: ${msg}\n  Check your API key and try again.`);
  } else if (msg.includes('ENOSPC') || msg.includes('no space left')) {
    spinner.fail('Disk full — free up space and retry.');
  } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    spinner.fail(`Connection refused: ${msg}\n  Check that Ollama is running: ollama serve`);
  } else if (msg.includes('EACCES') || msg.includes('permission denied')) {
    spinner.fail(`Permission denied: ${msg}\n  Check file permissions for your docs directory.`);
  } else {
    spinner.fail(`Pipeline failed: ${msg}\n  For help: github.com/ufukkaraca/ody-platform/discussions`);
  }
  process.exitCode = 1;
}

/** Create the onProgress callback for ingest. */
export function makeIngestProgressHandler(
  spinner: { text: string },
  startTime: number,
): (event: {
  phase: string;
  current: number;
  total: number;
  file?: string;
  chunkCurrent?: number;
  chunkTotal?: number;
}) => void {
  return (event) => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const timer = chalk.dim(`[${String(elapsed)}s]`);
    const fname = event.file ? basename(event.file) : '';
    const progress = `(${String(event.current)}/${String(event.total)})`;

    if (event.phase === 'edges') {
      spinner.text = `Linking relationships ${progress}... ${timer}`;
    } else if (event.phase === 'extract' && event.chunkTotal != null) {
      const chunk = `chunk ${String(event.chunkCurrent ?? 1)}/${String(event.chunkTotal)}`;
      spinner.text = `Extracting facts: ${fname} ${progress}, ${chunk} ${timer}`;
    } else if (event.phase === 'embed' && event.chunkTotal != null && event.chunkTotal > EMBED_BATCH_SIZE) {
      const chunk = `chunk ${String(event.chunkCurrent ?? 1)}/${String(event.chunkTotal)}`;
      spinner.text = `Embedding ${fname} ${progress}, ${chunk} ${timer}`;
    } else if (event.phase === 'embed') {
      spinner.text = `Embedding ${fname} ${progress}... ${timer}`;
    } else {
      spinner.text = `Scanning ${fname} ${progress}... ${timer}`;
    }
  };
}

/** Cached detection result returned when all files are unchanged. */
export interface CachedDetectionResult {
  detections: import('@useody/platform-core').Detection[];
}

/**
 * Try to load cached detections when no files were re-processed.
 * Returns null if no cache exists (caller should run fresh detection).
 */
export async function tryCachedDetections(
  db: unknown,
): Promise<CachedDetectionResult | null> {
  const { loadDetections } = await import('./detect/detection-store.js');
  const cached = loadDetections(db as never);
  if (!cached) return null;
  return { detections: cached };
}

/**
 * Create an elapsed-time ticker that updates the spinner periodically.
 * Returns a cleanup function to stop the ticker.
 */
export function createElapsedTicker(
  spinner: { text: string },
  analysisStart: number,
  getLastLogMsg: () => string,
  llmModelId: string,
  nodeCount: number,
): { updateElapsed: () => void; stop: () => void } {
  const updateElapsed = (): void => {
    const secs = Math.round((Date.now() - analysisStart) / 1000);
    const base = getLastLogMsg() || `Analyzing ${String(nodeCount)} docs with ${llmModelId}`;
    spinner.text = `${base}... (${String(secs)}s)`;
  };
  const ticker = setInterval(updateElapsed, 1_000);
  return { updateElapsed, stop: (): void => { clearInterval(ticker); } };
}

// EXCEEDS_LIMIT: pipeline orchestrator with cached-detection early-return path
/** Full first-run pipeline orchestrator. @module run-pipeline */
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { loadConfig } from './config/index.js';
import { detectEmbeddingProvider, detectLlmProvider } from './config/auto-detect.js';
import { createSpinner, printIngestSummary } from './output/index.js';
import {
  warmupLlm, makeIngestProgressHandler, createElapsedTicker, determineConsensusStrategy,
  printBanner, printFirstRunMessage, printTimingSummary, handlePipelineError,
  tryCachedDetections,
} from './run-pipeline-helpers.js';
import { generateAndOpenReport } from './run-pipeline-report.js';
import { record } from './telemetry.js';

/** Options for the full pipeline run. */
export interface PipelineOptions {
  directory: string;
  configPath?: string;
  noValidate?: boolean;
  provider?: string;
  model?: string;
  consensus?: boolean;
  consensusPasses?: number;
}
/**
 * Run the complete first-run pipeline:
 * config -> providers -> DB -> ingest -> detect -> report -> open browser.
 */
export async function runFullPipeline(
  options: PipelineOptions,
): Promise<void> {
  const startTime = Date.now();
  printBanner();
  const spinner = createSpinner('Initializing...');
  spinner.start();

  const config = loadConfig(options.configPath);
  const absDir = resolve(options.directory);
  printFirstRunMessage(config.dataDir);

  if (!config.dataDir.startsWith('/')) {
    config.dataDir = resolve(absDir, config.dataDir);
  }

  if (!existsSync(absDir)) {
    spinner.fail(`Directory not found: ${absDir}`);
    process.exit(1);
  }

  // Early check: bail fast if the directory is completely empty
  try {
    const entries = readdirSync(absDir);
    if (entries.length === 0) {
      spinner.fail(
        `Directory is empty: ${absDir}\n` +
        '  Add .md or .pdf files and try again.\n' +
        '  Example: ody-refine ./docs/',
      );
      process.exit(1);
    }
  } catch {
    // If we can't read the directory, let it fail later with a more specific error
  }

  const detectorNames = ['contradictions', 'duplicates', 'staleness', 'undocumented', 'time-bombs'];
  record('scan_started', { detector_names: detectorNames });

  try {
    spinner.text = 'Detecting embedding provider...';
    const embeddingProvider = await detectEmbeddingProvider(config);
    if (!embeddingProvider) {
      spinner.fail('No embedding provider found. Install Ollama or set OPENAI_API_KEY.');
      process.exit(1);
    }

    spinner.text = 'Detecting LLM provider...';
    let llm = await detectLlmProvider(config, {
      provider: options.provider, model: options.model,
    });
    if (!llm) {
      spinner.fail('No LLM detected. Install Ollama or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY.');
      process.exit(1);
    }

    try { await warmupLlm(llm, spinner); } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      spinner.fail(`LLM warmup failed: ${detail}\n  Check that Ollama is running: ollama serve`);
      process.exit(1);
    }

    // Step 2: Init SQLite DB
    spinner.text = 'Preparing database...';
    const core = await import('@useody/platform-core');
    mkdirSync(config.dataDir, { recursive: true });
    const db = core.openDatabase(resolve(config.dataDir, 'refine.db'));
    const dim = embeddingProvider.getDimension();
    core.createSchema(db, dim);

    // Step 3: Create repos + vec index + ingest log
    const nodeRepo = new core.SQLiteNodeRepository(db);
    const edgeRepo = new core.SQLiteEdgeRepository(db);
    const vecIndex = new core.SqliteVecIndex(db, dim);
    const { SQLiteIngestLog } = await import('./ingest/ingest-log.js');
    const ingestLog = new SQLiteIngestLog(db);

    // Step 4: Run ingestion
    spinner.text = llm
      ? `Scanning ${absDir} (LLM mode — this may take a few minutes)...`
      : `Scanning ${absDir}...`;
    const { ingestDirectory } = await import('./ingest/pipeline.js');

    const summary = await ingestDirectory({
      directory: absDir,
      nodeRepo, edgeRepo, vecIndex, embeddingProvider, llm, ingestLog,
      onProgress: makeIngestProgressHandler(spinner, startTime),
    });

    const ingestSecs = Math.round((Date.now() - startTime) / 1000);
    spinner.succeed(`Ingestion complete (${String(ingestSecs)}s)`);
    printIngestSummary(summary);

    if (summary.filesDiscovered === 0) {
      spinner.fail(
        `No markdown or PDF files found in ${absDir}.\n` +
        '  Ody Refine scans .md and .pdf files.\n' +
        '  Point it at a folder with documentation, e.g.:\n' +
        '    ody-refine ./docs/',
      );
      db.close();
      process.exitCode = 1;
      return;
    }

    // Step 5: Detection
    const detectStartMs = Date.now();
    const allNodes = await nodeRepo.findAll();
    let finalDetections: import('@useody/platform-core').Detection[];
    let totalDuration = Date.now() - startTime;
    let consultingResult: import('@useody/detectors').AnalysisResult | undefined;

    // If all files were cached (no new processing), reuse cached detections
    if (summary.filesProcessed === 0 && summary.filesDiscovered > 0) {
      const cachedResult = await tryCachedDetections(db);
      if (cachedResult) {
        spinner.succeed(`All files cached — reusing ${String(cachedResult.detections.length)} detection(s)`);
        const detectSecs = Math.round((Date.now() - detectStartMs) / 1000);
        printTimingSummary(ingestSecs, detectSecs);
        finalDetections = cachedResult.detections;
        const { loadIgnoreRules, applyIgnoreRules } = await import('./ignore.js');
        const afterIgnore = applyIgnoreRules(finalDetections, loadIgnoreRules(absDir));
        if (afterIgnore.length < finalDetections.length) {
          spinner.info?.(`Suppressed ${String(finalDetections.length - afterIgnore.length)} detection(s) via .ody-refine-ignore`);
        }
        finalDetections = afterIgnore;
        await generateAndOpenReport({
          consultingResult: undefined, finalDetections,
          filesDiscovered: summary.filesDiscovered,
          totalDuration: Date.now() - startTime, dataDir: config.dataDir, startTime,
        });
        record('scan_completed', {
          file_count: summary.filesDiscovered, node_count: allNodes.length,
          issue_count: finalDetections.length, duration_ms: Date.now() - startTime,
          detector_names: detectorNames,
        });
        db.close();
        return;
      }
    }

    if (llm && allNodes.length >= 2) {
      const { nodesToAnalysisInput, findingsToDetections } = await import('./detect/consultant-bridge.js');
      const analysisInput = nodesToAnalysisInput(allNodes);
      const strategy = determineConsensusStrategy(allNodes.length, options.consensus, summary.filesDiscovered);
      const analysisStart = Date.now();
      let lastLogMsg = '';

      if (strategy.reason) {
        spinner.info?.(strategy.reason);
      }

      const ticker = createElapsedTicker(
        spinner, analysisStart, () => lastLogMsg, llm.getModelId(), allNodes.length,
      );

      try {
        if (strategy.enabled) {
          const passes = options.consensusPasses ?? 3;
          spinner.start(`Consensus analysis (${String(passes)} passes) with ${llm.getModelId()}...`);
          const { runConsensusAnalysis } = await import('@useody/detectors');
          consultingResult = await runConsensusAnalysis(analysisInput, llm, {
            passes,
            minVotes: strategy.minVotes,
            logger: (msg) => { lastLogMsg = msg; ticker.updateElapsed(); },
          });
        } else {
          spinner.start(`Analyzing ${String(allNodes.length)} docs with ${llm.getModelId()}...`);
          const { analyzeCorpus, computeDeterministicHealthScore } = await import('@useody/detectors');
          consultingResult = await analyzeCorpus(analysisInput, llm, {
            logger: (msg) => { lastLogMsg = msg; ticker.updateElapsed(); },
          });
          consultingResult = {
            ...consultingResult,
            healthScore: computeDeterministicHealthScore(consultingResult.findings),
          };
        }
      } finally {
        ticker.stop();
      }

      finalDetections = findingsToDetections(consultingResult.findings, allNodes);
      totalDuration = Date.now() - startTime;
      const findingCount = consultingResult.findings.length;
      const analysisSecs = Math.round((Date.now() - analysisStart) / 1000);
      spinner.succeed(
        `Found ${String(findingCount)} issue${findingCount === 1 ? '' : 's'} (${String(analysisSecs)}s)`,
      );
    } else if (llm && allNodes.length < 2) {
      spinner.succeed('1 document analyzed — cross-document analysis requires at least 2 documents.');
      finalDetections = [];
    } else {
      // Fallback: heuristic detector pipeline (no LLM needed)
      spinner.start('Running detectors (heuristic mode)...');
      const detectorsMod = await import('@useody/detectors');

      const result = await core.runDetection({
        nodeRepo, edgeRepo, vecIndex, llm,
        detectors: [
          detectorsMod.detectContradictions, detectorsMod.detectDuplicates,
          detectorsMod.detectStaleness, detectorsMod.detectUndocumented,
          detectorsMod.detectTimeBombs,
        ],
        onProgress: (_name: string, status: string) => { spinner.text = status; },
      });

      spinner.succeed('Detection complete');
      totalDuration = result.stats.reduce((s, st) => s + st.durationMs, 0);
      finalDetections = result.detections;
    }

    const detectSecs = Math.round((Date.now() - detectStartMs) / 1000);
    printTimingSummary(ingestSecs, detectSecs);

    // Step 5a: Apply .ody-refine-ignore rules
    const { loadIgnoreRules, applyIgnoreRules } = await import('./ignore.js');
    const ignoreRules = loadIgnoreRules(absDir);
    const afterIgnore = applyIgnoreRules(finalDetections, ignoreRules);
    if (afterIgnore.length < finalDetections.length) {
      const suppressed = finalDetections.length - afterIgnore.length;
      spinner.info?.(`Suppressed ${String(suppressed)} detection(s) via .ody-refine-ignore`);
    }
    finalDetections = afterIgnore;

    // Step 6: Save detections + generate report + open
    const { saveDetections } = await import('./detect/detection-store.js');
    saveDetections(db as never, finalDetections);

    const overallScore = await generateAndOpenReport({
      consultingResult: consultingResult as import('@useody/export').AnalysisResult | undefined,
      finalDetections,
      filesDiscovered: summary.filesDiscovered,
      totalDuration,
      dataDir: config.dataDir,
      startTime,
    });

    const { saveHealthScore } = await import('./detect/detection-store.js');
    saveHealthScore(db as never, overallScore);

    record('scan_completed', {
      file_count: summary.filesDiscovered, node_count: allNodes.length,
      issue_count: finalDetections.length, duration_ms: Date.now() - startTime,
      detector_names: detectorNames,
    });
    db.close();
  } catch (error: unknown) {
    handlePipelineError(spinner, error);
  }
}

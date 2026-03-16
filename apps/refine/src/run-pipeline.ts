/**
 * Full first-run pipeline orchestrator.
 * Wires config, providers, DB, ingest, detect, report, and terminal output.
 * @module run-pipeline
 */
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from './config/index.js';
import { detectEmbeddingProvider, detectLlmProvider } from './config/auto-detect.js';
import {
  createSpinner,
  printIngestSummary,
  printDetectionSummary,
  openHtmlReport,
} from './output/index.js';
/** Options for the full pipeline run. */
export interface PipelineOptions {
  directory: string;
  configPath?: string;
  /** Skip LLM entirely — useful for fast heuristic-only scans. */
  noLlm?: boolean;
  /** Skip the LLM validation pass that filters false positives. */
  noValidate?: boolean;
}

/**
 * Run the complete first-run pipeline:
 * config → providers → DB → ingest → detect → report → open browser.
 */
export async function runFullPipeline(
  options: PipelineOptions,
): Promise<void> {
  const startTime = Date.now();
  const spinner = createSpinner('Initializing...');
  spinner.start();

  const config = loadConfig(options.configPath);
  const absDir = resolve(options.directory);

  if (!existsSync(absDir)) {
    spinner.fail(`Directory not found: ${absDir}`);
    process.exit(1);
  }

  try {
    // Step 1: Detect embedding provider
    spinner.text = 'Setting up embedding provider...';
    const embeddingProvider = await detectEmbeddingProvider(config);

    if (!embeddingProvider) {
      spinner.fail(
        'No embedding provider found.\n' +
        '  → Install Ollama (https://ollama.com) and run: ollama serve\n' +
        '  → Or set OPENAI_API_KEY for cloud embeddings.',
      );
      process.exit(1);
    }

    // Step 1b: Detect LLM (optional, improves detection quality)
    const llm = options.noLlm ? undefined : await detectLlmProvider(config);

    // Step 2: Init SQLite DB
    spinner.text = 'Preparing database...';
    const core = await import('@useody/platform-core');
    mkdirSync(config.dataDir, { recursive: true });
    const dbPath = resolve(config.dataDir, 'refine.db');
    const db = core.openDatabase(dbPath);
    const dim = embeddingProvider.getDimension();
    core.createSchema(db, dim);

    // Step 3: Create repos + vec index + ingest log
    const nodeRepo = new core.SQLiteNodeRepository(db);
    const edgeRepo = new core.SQLiteEdgeRepository(db);
    const vecIndex = new core.SqliteVecIndex(db, dim);
    const { SQLiteIngestLog } = await import('./ingest/ingest-log.js');
    const ingestLog = new SQLiteIngestLog(db);

    // Step 4: Run ingestion
    spinner.text = `Scanning ${absDir}...`;
    const { ingestDirectory } = await import('./ingest/pipeline.js');

    const summary = await ingestDirectory({
      directory: absDir,
      nodeRepo,
      edgeRepo,
      vecIndex,
      embeddingProvider,
      llm,
      ingestLog,
      onProgress: (event) => {
        spinner.text = event.phase === 'edges'
          ? 'Reasoning about relationships between nodes...'
          : `[${event.phase}] ${event.file ?? ''} (${event.current}/${event.total})`;
      },
    });

    spinner.succeed('Ingestion complete');
    printIngestSummary(summary);

    if (summary.filesDiscovered === 0) {
      process.stdout.write(
        '\n  No markdown or PDF files found in that directory.\n' +
        '  Try pointing at a folder with .md files.\n\n',
      );
      process.exit(0);
    }

    // Step 5: Run all 5 detectors WITH LLM
    spinner.start(
      llm
        ? `Running detectors (LLM: ${llm.getModelId()})...`
        : 'Running detectors (heuristic mode)...',
    );
    const detectorsMod = await import('@useody/detectors');

    const result = await core.runDetection({
      nodeRepo,
      edgeRepo,
      vecIndex,
      llm,
      detectors: [
        detectorsMod.detectContradictions,
        detectorsMod.detectDuplicates,
        detectorsMod.detectStaleness,
        detectorsMod.detectUndocumented,
        detectorsMod.detectTimeBombs,
      ],
      onProgress: (_name: string, status: string) => {
        spinner.text = status;
      },
    });

    spinner.succeed('Detection complete');

    // Step 5b: LLM validation pass — filter false positives
    let finalDetections = result.detections;
    if (llm && !options.noValidate && result.detections.length > 0) {
      const { validateDetections } = await import('./detect/validate-detections.js');
      const total = result.detections.length;
      spinner.start(`Validating findings (0/${String(total)})...`);

      const allNodes = await nodeRepo.findAll();
      const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

      const validated = await validateDetections(
        result.detections,
        nodeMap,
        llm,
        { maxValidations: 20 },
        (done, tot) => {
          spinner.text = `Validating findings (${String(done)}/${String(tot)})...`;
        },
      );

      const realCount = validated.filter((v) => v.isReal).length;
      spinner.succeed(
        `Validated: ${String(realCount)} real issues from ${String(total)} candidates`,
      );

      // Enrich metadata with impact/explanation/confidence; filter to real only
      finalDetections = validated
        .filter((v) => v.isReal)
        .map((v) => ({
          ...v,
          metadata: {
            ...v.metadata,
            impact: v.impact,
            explanation: v.explanation,
            confidence: v.confidence,
          },
        }));
    }

    // Step 6: Generate HTML report
    const { generateHtmlReport } = await import('@useody/export');
    const totalDuration = result.stats.reduce(
      (s, st) => s + st.durationMs, 0,
    );
    const totalNodes = result.stats.reduce(
      (s, st) => Math.max(s, st.nodeCount), 0,
    );
    const html = generateHtmlReport(finalDetections, {
      nodeCount: totalNodes,
      durationMs: totalDuration,
    });

    const reportPath = resolve(config.dataDir, 'report.html');
    writeFileSync(reportPath, html, 'utf-8');

    // Step 7: Print summary (with report path for next-steps)
    printDetectionSummary(finalDetections, {
      durationMs: Date.now() - startTime,
      fileCount: summary.filesDiscovered,
      reportPath,
    });

    // Step 8: Open in browser
    await openHtmlReport(reportPath);

    // Force exit — the `open` package may keep the process alive
    process.exit(0);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`Pipeline failed: ${msg}`);
    process.exit(1);
  }
}

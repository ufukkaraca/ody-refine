/**
 * Scan command — crawls public docs and runs the detect pipeline.
 * @module commands/scan
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { detectEmbeddingProvider } from '../config/auto-detect.js';
import { createSpinner, printDetectionSummary } from '../output/index.js';
import { openHtmlReport } from '../output/open-browser.js';

/** Create the scan command. */
export function createScanCommand(): Command {
  return new Command('scan')
    .description('Scan public docs at a URL for knowledge issues')
    .argument('<url>', 'URL to crawl (e.g. https://docs.example.com)')
    .option('--config <path>', 'Path to config file')
    .option('--max-pages <n>', 'Maximum pages to crawl', '50')
    .option('--max-depth <n>', 'Maximum crawl depth', '2')
    .option('--no-report', 'Skip HTML report generation')
    .action(async (
      url: string,
      opts: {
        config?: string;
        maxPages: string;
        maxDepth: string;
        report: boolean;
      },
    ) => {
      const spinner = createSpinner('Initializing scanner...');
      spinner.start();

      try {
        // Validate URL
        const parsedUrl = new URL(url);
        if (!parsedUrl.protocol.startsWith('http')) {
          spinner.fail('URL must start with http:// or https://');
          process.exitCode = 1;
          return;
        }

        const config = loadConfig(opts.config);
        const maxPages = parseInt(opts.maxPages, 10);
        const maxDepth = parseInt(opts.maxDepth, 10);

        // Step 1: Detect embedding provider
        spinner.text = 'Detecting embedding provider...';
        const embeddingProvider = await detectEmbeddingProvider(config);
        if (!embeddingProvider) {
          spinner.fail(
            'No embedding provider available.\n' +
            '  → Is Ollama running? Or set OPENAI_API_KEY.',
          );
          process.exitCode = 1;
          return;
        }

        // Step 2: Crawl the site
        spinner.text = `Crawling ${parsedUrl.hostname}...`;
        const { crawlSite } = await import('../ingest/web-crawler.js');
        const pages = await crawlSite(url, {
          maxPages,
          maxDepth,
          onProgress: (event) => {
            spinner.text = `Crawled ${event.fetched} pages (${event.queued} queued) — ${event.url}`;
          },
        });

        if (pages.length === 0) {
          spinner.fail('No pages found. Check the URL and try again.');
          process.exitCode = 1;
          return;
        }
        spinner.succeed(`Crawled ${pages.length} pages from ${parsedUrl.hostname}`);

        // Step 3: Ingest crawled pages
        await ingestAndDetect(
          pages, config, embeddingProvider, opts.report, spinner,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Scan failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}

/** Ingest crawled pages and run detectors. */
async function ingestAndDetect(
  pages: Array<{ url: string; title: string; markdown: string }>,
  config: ReturnType<typeof loadConfig>,
  embeddingProvider: import('@useody/platform-core').EmbeddingProvider,
  generateReport: boolean,
  spinner: ReturnType<typeof createSpinner>,
): Promise<void> {
  const core = await import('@useody/platform-core');
  const dataDir = resolve(config.dataDir, 'scan');
  mkdirSync(dataDir, { recursive: true });

  const dbPath = resolve(dataDir, 'scan.db');
  const db = core.openDatabase(dbPath);
  const dim = embeddingProvider.getDimension();
  core.createSchema(db, dim);

  const nodeRepo = new core.SQLiteNodeRepository(db);
  const edgeRepo = new core.SQLiteEdgeRepository(db);
  const vecIndex = new core.SqliteVecIndex(db, dim);

  // Ingest each page as a knowledge node
  spinner.start(`Ingesting ${pages.length} pages...`);
  const { chunkMarkdown } = await import('../ingest/chunker.js');
  const { reasonEdgesHeuristic } = await import('../ingest/reason-edges.js');
  let nodeCount = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    spinner.text = `Ingesting [${i + 1}/${pages.length}] ${page.title}`;

    const chunks = chunkMarkdown(page.markdown);
    for (const chunk of chunks) {
      const embedding = await embeddingProvider.embed(chunk.text);
      const now = new Date();
      const node = {
        id: crypto.randomUUID(),
        title: chunk.metadata.heading ?? page.title,
        content: {
          summary: chunk.text.slice(0, 200),
          raw: chunk.text,
          source: { sourceType: 'web', sourceId: page.url, url: page.url },
        },
        embedding,
        embeddingModel: embeddingProvider.getModelId(),
        embeddingDim: dim,
        confidence: 1.0,
        metadata: { url: page.url, charOffset: chunk.metadata.charOffset },
        createdAt: now,
        updatedAt: now,
      };
      await nodeRepo.upsert(node);
      await vecIndex.add(node.id, embedding);
      nodeCount++;
    }
  }
  spinner.succeed(`Ingested ${nodeCount} nodes from ${pages.length} pages`);

  // Reason about edges
  spinner.start('Reasoning about relationships...');
  const allNodes = await nodeRepo.findAll();
  const edgeCount = await reasonEdgesHeuristic(allNodes, edgeRepo, vecIndex);
  spinner.succeed(`Created ${edgeCount} edges`);

  // Run detectors
  spinner.start('Running detectors...');
  const detectorsMod = await import('@useody/detectors');
  const result = await core.runDetection({
    nodeRepo,
    edgeRepo,
    vecIndex,
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
  printDetectionSummary(result.detections);

  // Generate report
  if (generateReport) {
    const { generateHtmlReport } = await import('@useody/export');
    const totalDuration = result.stats.reduce((s, st) => s + st.durationMs, 0);
    const html = generateHtmlReport(result.detections, {
      nodeCount,
      durationMs: totalDuration,
    });
    const reportPath = resolve(dataDir, 'scan-report.html');
    writeFileSync(reportPath, html, 'utf-8');
    await openHtmlReport(reportPath);
    process.stdout.write(`\n  Report: ${reportPath}\n\n`);
  }
}

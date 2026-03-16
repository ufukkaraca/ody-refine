/**
 * Detect command — runs detectors on the knowledge graph.
 * @module commands/detect
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { DetectorFn } from '@useody/platform-core';
import { loadConfig } from '../config/index.js';
import { detectLlmProvider } from '../config/auto-detect.js';
import { createSpinner, printDetectionSummary } from '../output/index.js';

/** Valid --type values mapped to their detector index. */
const DETECTOR_TYPES = [
  'contradiction', 'duplicate', 'staleness', 'undocumented', 'time_bomb',
] as const;

/** Create the detect command. */
export function createDetectCommand(): Command {
  return new Command('detect')
    .description('Run detectors to find issues in the knowledge graph')
    .option('--config <path>', 'Path to config file')
    .option('--type <type>', `Run only a specific detector (${DETECTOR_TYPES.join(', ')})`)
    .option('--no-llm', 'Skip LLM entirely (heuristic mode — fast, no Ollama needed)')
    .option('--no-validate', 'Skip the LLM validation pass that filters false positives')
    .addHelpText('after', `
Examples:
  $ ody-refine detect                            Run all 5 detectors
  $ ody-refine detect --no-llm                   Fast heuristic-only scan (no Ollama needed)
  $ ody-refine detect --type contradiction       Contradictions only
  $ ody-refine detect --type time_bomb           Expired/approaching deadlines
  $ ody-refine detect --no-validate              Skip LLM validation (faster)

Requires a prior 'ody-refine ingest' run.
`)
    .action(async (opts: { config?: string; type?: string; llm?: boolean; validate?: boolean }) => {
      const spinner = createSpinner('Loading knowledge graph...');
      spinner.start();

      const config = loadConfig(opts.config);

      try {
        const dbPath = resolve(config.dataDir, 'refine.db');
        if (!existsSync(dbPath)) {
          spinner.fail(`No database found at ${dbPath}. Run 'ody-refine ingest' first.`);
          process.exitCode = 1;
          return;
        }

        const core = await import('@useody/platform-core');
        const detectorsMod = await import('@useody/detectors');

        const db = core.openDatabase(dbPath);
        const row = db.prepare(
          'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
        ).get() as { embedding_dim: number } | undefined;
        const dim = row?.embedding_dim ?? 384;
        core.createSchema(db, dim);

        const nodeRepo = new core.SQLiteNodeRepository(db);
        const edgeRepo = new core.SQLiteEdgeRepository(db);
        const vecIndex = new core.SqliteVecIndex(db, dim);

        const noLlm = opts.llm === false;
        spinner.text = noLlm ? 'Running in heuristic mode (--no-llm)...' : 'Detecting LLM provider...';
        const llm = noLlm ? undefined : await detectLlmProvider(config);

        const detectorMap: Record<string, DetectorFn> = {
          contradiction: detectorsMod.detectContradictions,
          duplicate: detectorsMod.detectDuplicates,
          staleness: detectorsMod.detectStaleness,
          undocumented: detectorsMod.detectUndocumented,
          time_bomb: detectorsMod.detectTimeBombs,
        };

        let detectors: DetectorFn[];
        if (opts.type) {
          const match = detectorMap[opts.type];
          if (!match) {
            spinner.fail(`Unknown detector type '${opts.type}'. Valid: ${DETECTOR_TYPES.join(', ')}`);
            process.exitCode = 1;
            return;
          }
          detectors = [match];
        } else {
          detectors = Object.values(detectorMap);
        }

        spinner.text = llm
          ? `Running ${String(detectors.length)} detector(s) (LLM: ${llm.getModelId()})...`
          : `Running ${String(detectors.length)} detector(s) (heuristic mode)...`;

        const result = await core.runDetection({
          nodeRepo,
          edgeRepo,
          vecIndex,
          llm,
          detectors,
          onProgress: (_name: string, status: string) => {
            spinner.text = status;
          },
        });

        spinner.succeed('Detection complete');

        // LLM validation pass — filter false positives
        const noValidate = opts.validate === false;
        let finalDetections = result.detections;
        if (llm && !noValidate && result.detections.length > 0) {
          const { validateDetections } = await import('../detect/validate-detections.js');
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

        // Save to cache for report command
        const { saveDetections } = await import('../detect/detection-store.js');
        saveDetections(db as never, finalDetections);

        printDetectionSummary(finalDetections);
        process.exit(0);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Detection failed: ${msg}`);
        process.exit(1);
      }
    });
}

/**
 * Optimize command — runs the autoresearch detector optimization loop.
 * @module commands/optimize
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { detectLlmProvider } from '../config/auto-detect.js';
import { createSpinner } from '../output/index.js';

/** Create the optimize command. */
export function createOptimizeCommand(): Command {
  return new Command('optimize')
    .description('Run autoresearch loop to optimize detector thresholds')
    .requiredOption('--corpus <path>', 'Directory of docs with known issues')
    .requiredOption('--ground-truth <path>', 'Path to ground truth JSON file')
    .option('--iterations <n>', 'Max optimization iterations', '20')
    .option('--timeout <ms>', 'Timeout per run in ms', '60000')
    .option('--config <path>', 'Path to config file')
    .addHelpText('after', `
Examples:
  $ ody-refine optimize --corpus ./docs/ --ground-truth ./gt.json
  $ ody-refine optimize --corpus ./docs/ --ground-truth ./gt.json --iterations 50

The optimizer iteratively tunes detector thresholds (similarity, topK, etc.)
to maximize F1 score against labeled ground truth findings.
`)
    .action(async (opts: {
      corpus: string;
      groundTruth: string;
      iterations: string;
      timeout: string;
      config?: string;
    }) => {
      const spinner = createSpinner('Starting autoresearch optimization...');
      spinner.start();

      const corpusPath = resolve(opts.corpus);
      const truthPath = resolve(opts.groundTruth);

      if (!existsSync(corpusPath)) {
        spinner.fail(`Corpus directory not found: ${corpusPath}`);
        process.exitCode = 1;
        return;
      }
      if (!existsSync(truthPath)) {
        spinner.fail(`Ground truth file not found: ${truthPath}`);
        process.exitCode = 1;
        return;
      }

      const config = loadConfig(opts.config);

      try {
        spinner.text = 'Detecting LLM provider...';
        const llm = await detectLlmProvider(config);
        if (!llm) {
          spinner.fail(
            'No LLM provider available. Set OPENROUTER_API_KEY or start Ollama.',
          );
          process.exitCode = 1;
          return;
        }

        const { loadGroundTruth, optimize } = await import('../autoresearch/index.js');
        const groundTruth = loadGroundTruth(truthPath);
        const maxIterations = parseInt(opts.iterations, 10) || 20;
        const timeoutPerRun = parseInt(opts.timeout, 10) || 60000;

        spinner.text = `Optimizing (${String(maxIterations)} iterations, ${String(groundTruth.length)} ground truth entries)...`;

        const result = await optimize({
          testCorpusPath: corpusPath,
          groundTruth,
          maxIterations,
          timeoutPerRun,
          llm,
          onProgress: (iter, score, improved) => {
            const mark = improved ? '↑' : '·';
            spinner.text = `[${String(iter)}/${String(maxIterations)}] ` +
              `F1=${score.f1.toFixed(3)} P=${score.precision.toFixed(3)} ` +
              `R=${score.recall.toFixed(3)} ${mark}`;
          },
        });

        spinner.succeed('Optimization complete');

        printOptimizeResult(result);
        process.exit(0);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Optimization failed: ${msg}`);
        process.exit(1);
      }
    });
}

/** Print optimization results to stdout. */
function printOptimizeResult(
  result: import('../autoresearch/optimize.js').OptimizeResult,
): void {
  const w = process.stdout.write.bind(process.stdout);
  w('\n  Autoresearch Results\n');
  w('  ═══════════════════\n');
  w(`  Best F1:        ${result.bestF1.toFixed(3)}\n`);
  w(`  Best Precision: ${result.bestPrecision.toFixed(3)}\n`);
  w(`  Best Recall:    ${result.bestRecall.toFixed(3)}\n`);
  w(`  Iterations:     ${String(result.iterations.length)}\n\n`);
  w('  Best config:\n');
  w(`  ${JSON.stringify(result.bestConfig, null, 2).replace(/\n/g, '\n  ')}\n\n`);

  w('  Iteration log:\n');
  for (const it of result.iterations) {
    const mark = it.improved ? '+' : ' ';
    w(`  [${mark}] ${String(it.iteration).padStart(2)}: ` +
      `F1=${it.score.f1.toFixed(3)} P=${it.score.precision.toFixed(3)} ` +
      `R=${it.score.recall.toFixed(3)} (${String(it.durationMs)}ms)\n`);
  }
  w('\n');
}

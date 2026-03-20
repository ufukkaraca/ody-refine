/**
 * Benchmark runner: loops multiple models, runs all detection approaches,
 * outputs a publishable markdown comparison table, and persists intermediate
 * results so crashes don't lose progress.
 *
 * Usage:
 *   npx tsx scripts/run-benchmark.ts
 *   npx tsx scripts/run-benchmark.ts --models=anthropic/claude-3-haiku,openai/gpt-4o
 *   BENCHMARK_MODELS=anthropic/claude-3-haiku npx tsx scripts/run-benchmark.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runBenchmark } from '../packages/detectors/src/benchmark.js';
import type { ModelRunResult } from './benchmark-helpers.js';
import {
  loadCorpus,
  createOpenRouterProvider,
  parseModels,
  formatMarkdownTable,
  saveIntermediateResults,
} from './benchmark-helpers.js';

async function main(): Promise<void> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY required. Set it in your environment.');
    process.exit(1);
  }

  const models = parseModels();
  const baseDir = resolve(import.meta.dirname ?? '.', '..');
  const corpus = loadCorpus(baseDir);

  const positives = corpus.groundTruth.filter((g) => g.isContradiction).length;
  const negatives = corpus.groundTruth.length - positives;
  console.log(
    `Corpus: ${corpus.nodes.length} nodes, ${corpus.groundTruth.length} pairs ` +
    `(${positives} positive, ${negatives} negative)`,
  );
  console.log(`Models: ${models.join(', ')}\n`);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = resolve(baseDir, `benchmark-results-${ts}.json`);
  const completedRuns: ModelRunResult[] = [];

  for (const model of models) {
    console.log('='.repeat(60));
    console.log(`MODEL: ${model}`);
    console.log('='.repeat(60));

    try {
      const llm = createOpenRouterProvider(apiKey, model);
      const report = await runBenchmark(corpus, llm);

      completedRuns.push({
        model,
        report,
        completedAt: new Date().toISOString(),
      });

      for (const r of report.results) {
        const p = (r.precision * 100).toFixed(1);
        const rc = (r.recall * 100).toFixed(1);
        const f1 = (r.f1 * 100).toFixed(1);
        console.log(
          `  ${r.approach}: P=${p}% R=${rc}% F1=${f1}% (${r.durationMs}ms)`,
        );
      }
      console.log(`  Gate: ${report.passesGate ? 'PASS' : 'FAIL'}`);

      saveIntermediateResults(completedRuns, jsonPath);
      console.log(`  Saved to ${jsonPath}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
      console.error(`  Skipping ${model}, continuing...\n`);
    }
  }

  if (completedRuns.length === 0) {
    console.error('No models completed successfully.');
    process.exit(1);
  }

  const markdown = formatMarkdownTable(completedRuns);
  console.log('\n' + markdown);

  const mdPath = resolve(baseDir, `benchmark-results-${ts}.md`);
  writeFileSync(mdPath, markdown);
  console.log(`\nMarkdown report: ${mdPath}`);
  console.log(`JSON results: ${jsonPath}`);

  const allPass = completedRuns.every((r) => r.report.passesGate);
  process.exit(allPass ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err);
  process.exit(2);
});

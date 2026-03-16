/**
 * Ingest command — scans a directory and runs the full pipeline.
 * @module commands/ingest
 */
import { Command } from 'commander';
import { runFullPipeline } from '../run-pipeline.js';

/** Create the ingest command. */
export function createIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest markdown and PDF files into the knowledge graph')
    .argument('[directory]', 'Directory to scan', '.')
    .option('--config <path>', 'Path to config file')
    .option('--no-llm', 'Skip LLM entirely for fast heuristic-only scan')
    .option('--no-validate', 'Skip the LLM validation pass that filters false positives')
    .addHelpText('after', `
Examples:
  $ ody-refine ingest ./docs/          Scan a local directory
  $ ody-refine ingest . --no-llm       Fast heuristic-only scan (no Ollama needed)
  $ ody-refine ./docs/                 Shorthand — ingest is the default command

The first run downloads a small embedding model (~23 MB) if no provider is
detected. Subsequent runs reuse the cache and are much faster.
`)
    .action(async (directory: string, opts: { config?: string; llm?: boolean; validate?: boolean }) => {
      await runFullPipeline({
        directory,
        configPath: opts.config,
        noLlm: !opts.llm,
        noValidate: !opts.validate,
      });
    });
}

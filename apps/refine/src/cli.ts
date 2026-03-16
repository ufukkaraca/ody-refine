#!/usr/bin/env node
/**
 * ody-refine CLI entry point.
 * Supports `ody-refine <path>` as shorthand for `ody-refine ingest <path>`.
 * @module cli
 */
import { Command } from 'commander';
import {
  createIngestCommand,
  createDetectCommand,
  createResolveCommand,
  createExportCommand,
  createReportCommand,
  createStatusCommand,
  createConfigCommand,
  createCiCommand,
  createScanCommand,
  createOptimizeCommand,
  createDiffCommand,
  createBadgeCommand,
} from './commands/index.js';

/** Known subcommand names — used to detect the default command case. */
const SUBCOMMANDS = new Set([
  'ingest', 'detect', 'resolve', 'export', 'report', 'status', 'config',
  'ci', 'scan', 'optimize', 'diff', 'badge', 'help',
]);

/**
 * If the first arg isn't a known subcommand or flag, treat it as a directory
 * path and insert 'ingest' so `ody-refine ./docs/` works like `ody-refine ingest ./docs/`.
 */
function insertDefaultCommand(): void {
  const firstArg = process.argv[2];
  if (firstArg && !firstArg.startsWith('-') && !SUBCOMMANDS.has(firstArg)) {
    process.argv.splice(2, 0, 'ingest');
  }
}

/** Create and configure the CLI program. */
function createProgram(): Command {
  const program = new Command();

  program
    .name('ody-refine')
    .description('Find contradictions, staleness, and drift in your docs — locally.')
    .version('0.1.0')
    .addHelpText('after', `
Getting started:
  $ ody-refine ./docs/                 Scan a directory (ingest + detect + report)
  $ ody-refine ingest . --no-llm       Fast heuristic scan (no Ollama needed)
  $ ody-refine report                  Regenerate the HTML report

Docs: https://github.com/rodyr/ody-platform
`);

  program.addCommand(createIngestCommand());
  program.addCommand(createDetectCommand());
  program.addCommand(createResolveCommand());
  program.addCommand(createExportCommand());
  program.addCommand(createReportCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createCiCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createOptimizeCommand());
  program.addCommand(createDiffCommand());
  program.addCommand(createBadgeCommand());

  return program;
}

insertDefaultCommand();
const program = createProgram();
program.parse(process.argv);

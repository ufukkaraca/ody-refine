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
  createConnectCommand,
  createAuditCommand,
  createTelemetryCommand,
} from './commands/index.js';
import { getVersion } from './run-pipeline-helpers.js';

/** Known subcommand names — used to detect the default command case. */
const SUBCOMMANDS = new Set([
  'ingest', 'detect', 'resolve', 'export', 'report', 'status', 'config',
  'ci', 'scan', 'optimize', 'diff', 'badge', 'connect', 'audit', 'telemetry', 'help',
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
    .version(getVersion())
    .addHelpText('after', `
Common workflows:
  $ ody-refine ./docs/                              First scan (ingest + detect + report)
  $ ody-refine audit --deep --dir ./docs/            Deep multi-source audit
  $ ody-refine resolve                               Fix issues interactively
  $ ody-refine export --format jsonl                 Export training pairs
  $ ody-refine export --format tickets               Export as action items
  $ ody-refine diff                                  Compare with previous scan
  $ ody-refine ci --min-health 80                    CI/CD quality gate

Docs: https://github.com/ufukkaraca/ody-refine
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
  program.addCommand(createConnectCommand());
  program.addCommand(createAuditCommand());
  program.addCommand(createTelemetryCommand());

  return program;
}

insertDefaultCommand();
const program = createProgram();
program.parse(process.argv);

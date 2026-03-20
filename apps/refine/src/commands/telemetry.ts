/**
 * Telemetry subcommand — manage opt-in anonymous telemetry.
 * @module commands/telemetry
 */
import { Command } from 'commander';
import { isEnabled, enable, disable, statusText, readLog } from '../telemetry.js';

/** Create the telemetry command. */
export function createTelemetryCommand(): Command {
  const cmd = new Command('telemetry')
    .description('Manage opt-in anonymous telemetry')
    .argument('[action]', 'on | off | status (default: status)')
    .addHelpText('after', `
Examples:
  $ ody-refine telemetry             Show current telemetry status
  $ ody-refine telemetry status      Show current telemetry status
  $ ody-refine telemetry on          Enable anonymous telemetry
  $ ody-refine telemetry off         Disable anonymous telemetry
`)
    .action((action?: string) => {
      const normalised = (action ?? 'status').toLowerCase();

      if (normalised === 'on') {
        enable();
        process.stdout.write('Telemetry enabled. Anonymous usage data will be logged to ~/.ody/telemetry.jsonl\n');
        process.stdout.write('No file paths, file contents, or personal information are ever collected.\n');
        return;
      }

      if (normalised === 'off') {
        disable();
        process.stdout.write('Telemetry disabled.\n');
        return;
      }

      if (normalised === 'status') {
        process.stdout.write(`Telemetry: ${statusText()}\n`);
        if (isEnabled()) {
          const entries = readLog();
          process.stdout.write(`Logged events: ${String(entries.length)}\n`);
        }
        return;
      }

      process.stderr.write(`Unknown action: ${normalised}. Use on, off, or status.\n`);
      process.exitCode = 1;
    });

  return cmd;
}

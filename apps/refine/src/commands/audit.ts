/**
 * Audit command — multi-source deep analysis.
 * Combines local files, Notion, and Slack into one corpus,
 * then runs the standard ingest+detect+report pipeline.
 * @module commands/audit
 */
import { Command } from 'commander';
import { rmSync } from 'node:fs';
import { collectDeepAuditSources } from './audit-deep.js';
import { runFullPipeline } from '../run-pipeline.js';

/** Create the audit command. */
export function createAuditCommand(): Command {
  return new Command('audit')
    .description(
      'Deep audit — combine multiple sources into one analysis',
    )
    .option('--deep', 'Multi-source mode (default, kept for compatibility)')
    .option('--dir <path>', 'Local directory to include')
    .option('--notion', 'Include Notion workspace')
    .option('--slack', 'Include Slack workspace')
    .option('--confluence', 'Include Confluence workspace')
    .option('--jira', 'Include Jira workspace')
    .option('--notion-token <token>', 'Notion API token override')
    .option('--slack-token <token>', 'Slack bot token override')
    .option('--confluence-url <url>', 'Confluence base URL override')
    .option('--confluence-email <email>', 'Confluence email override')
    .option('--confluence-token <token>', 'Confluence API token override')
    .option('--jira-url <url>', 'Jira base URL override')
    .option('--jira-email <email>', 'Jira email override')
    .option('--jira-token <token>', 'Jira API token override')
    .option('--provider <name>', 'LLM provider')
    .option('--model <id>', 'Model to use')
    .option('--no-validate', 'Skip LLM validation pass')
    .option('--config <path>', 'Path to config file')
    .addHelpText('after', `
Examples:
  $ ody-refine audit --dir ./docs/ --notion --slack
  $ ody-refine audit --dir ./docs/ --confluence --jira
  $ ody-refine audit --confluence --confluence-url https://myco.atlassian.net
  $ ody-refine audit --jira --jira-url https://myco.atlassian.net
  $ ody-refine audit --slack --slack-token <your-bot-token>
`)
    .action(async (opts: {
      deep?: boolean;
      dir?: string;
      notion?: boolean;
      slack?: boolean;
      confluence?: boolean;
      jira?: boolean;
      notionToken?: string;
      slackToken?: string;
      confluenceUrl?: string;
      confluenceEmail?: string;
      confluenceToken?: string;
      jiraUrl?: string;
      jiraEmail?: string;
      jiraToken?: string;
      provider?: string;
      model?: string;
      validate?: boolean;
      config?: string;
    }) => {
      const hasSrc = opts.dir || opts.notion || opts.slack ||
        opts.confluence || opts.jira;
      if (!hasSrc) {
        process.stderr.write(
          'Error: At least one source is required.\n' +
          'Use --dir, --notion, --slack, --confluence, and/or --jira.\n',
        );
        process.exitCode = 1;
        return;
      }

      process.stdout.write('\n  Deep audit — multi-source analysis\n\n');

      const collection = await collectDeepAuditSources({
        dir: opts.dir,
        includeNotion: opts.notion,
        includeSlack: opts.slack,
        includeConfluence: opts.confluence,
        includeJira: opts.jira,
        notionToken: opts.notionToken,
        slackToken: opts.slackToken,
        confluenceToken: opts.confluenceToken,
        confluenceUrl: opts.confluenceUrl,
        confluenceEmail: opts.confluenceEmail,
        jiraToken: opts.jiraToken,
        jiraUrl: opts.jiraUrl,
        jiraEmail: opts.jiraEmail,
        onProgress: (msg) => {
          process.stdout.write(`  ${msg}\n`);
        },
      });

      if (collection.totalDocCount === 0) {
        process.stderr.write(
          'No documents collected from any source.\n',
        );
        process.exitCode = 1;
        return;
      }

      process.stdout.write(
        `\n  Collected ${String(collection.totalDocCount)} documents total\n` +
        `  Running pipeline on combined corpus...\n\n`,
      );

      try {
        await runFullPipeline({
          directory: collection.stagingDir,
          configPath: opts.config,
          noValidate: !opts.validate,
          provider: opts.provider,
          model: opts.model,
        });
      } finally {
        // Clean up staging directory
        try {
          rmSync(collection.stagingDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup
        }
      }
    });
}

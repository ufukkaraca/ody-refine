/**
 * Ingest command — scans a directory and runs the full pipeline.
 * Supports raw directories and Notion exports.
 * @module commands/ingest
 */
import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFullPipeline } from '../run-pipeline.js';

/** Create the ingest command. */
export function createIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest markdown and PDF files into the knowledge graph')
    .argument('[directory]', 'Directory to scan', '.')
    .option('--config <path>', 'Path to config file')
    .option('--no-validate', 'Skip the LLM validation pass that filters false positives')
    .option('--provider <name>', 'LLM provider (openai, anthropic, groq, gemini, xai, openrouter, ollama)')
    .option('--model <id>', 'Model to use (e.g. gpt-4o-mini, claude-haiku-4-5)')
    .option('--notion-export <path>', 'Path to Notion export directory')
    .option('--confluence-export <path>', 'Path to Confluence HTML export directory')
    .option('--consensus', 'Enable consensus voting (auto-adjusts for small doc sets)')
    .option('--no-consensus', 'Disable consensus voting')
    .option('--consensus-passes <n>', 'Number of consensus passes (default: 3)')
    .addHelpText('after', `
Examples:
  $ ody-refine ingest ./docs/                          Scan local files
  $ ody-refine ingest --notion-export ./Export/         Notion export
  $ ody-refine ingest --confluence-export ./HMIS/       Confluence export
  $ ody-refine ingest ./docs/ --no-consensus            Single-pass analysis
  $ ody-refine ./docs/                                 Shorthand

Notion exports: Export your Notion workspace as Markdown or HTML,
then point --notion-export at the exported directory.
`)
    .action(async (directory: string, opts: {
      config?: string; llm?: boolean; validate?: boolean;
      provider?: string; model?: string;
      notionExport?: string; confluenceExport?: string;
      consensus?: boolean; consensusPasses?: string;
    }) => {
      let targetDir = directory;

      // Handle Confluence export (directory or ZIP file)
      if (opts.confluenceExport) {
        let confluencePath = opts.confluenceExport;

        // If it's a ZIP file, extract first
        if (confluencePath.endsWith('.zip')) {
          const { spawnSync } = await import('node:child_process');
          const tmpExtract = join('.ody-refine', 'confluence-extract');
          mkdirSync(tmpExtract, { recursive: true });
          process.stdout.write('  Extracting ZIP archive...\n');
          const result = spawnSync('unzip', ['-o', '-j', confluencePath, '*.html', '-d', tmpExtract], { stdio: 'pipe' });
          if (result.status !== 0) {
            throw new Error(`Failed to extract ZIP: ${result.stderr?.toString() ?? 'unknown error'}`);
          }
          confluencePath = tmpExtract;
        }

        const { extractConfluencePages } = await import(
          '../ingest/confluence-import.js'
        );
        const pages = extractConfluencePages(confluencePath);
        if (pages.length === 0) {
          process.stderr.write(
            'No pages found in Confluence export. Check the path.\n',
          );
          process.exit(1);
        }
        const tmpDir = join('.ody-refine', 'confluence-import');
        mkdirSync(tmpDir, { recursive: true });
        for (const page of pages) {
          const safeName = page.title.replace(/[^a-zA-Z0-9-_ ]/g, '')
            .slice(0, 60) + '.md';
          writeFileSync(join(tmpDir, safeName), `# ${page.title}\n\n${page.content}`);
        }
        targetDir = tmpDir;
        process.stdout.write(
          `  Extracted ${String(pages.length)} pages from Confluence export\n`,
        );
      }

      // Handle Notion export
      if (opts.notionExport) {
        const { extractNotionPages } = await import(
          '../ingest/notion-import.js'
        );
        const pages = extractNotionPages(opts.notionExport);
        if (pages.length === 0) {
          process.stderr.write(
            'No pages found in Notion export. Check the path.\n',
          );
          process.exit(1);
        }
        // Write pages as markdown to temp dir
        const tmpDir = join('.ody-refine', 'notion-import');
        mkdirSync(tmpDir, { recursive: true });
        for (const page of pages) {
          const safeName = page.title.replace(/[^a-zA-Z0-9-_ ]/g, '')
            .slice(0, 60) + '.md';
          writeFileSync(join(tmpDir, safeName), `# ${page.title}\n\n${page.content}`);
        }
        targetDir = tmpDir;
        process.stdout.write(
          `  Extracted ${String(pages.length)} pages from Notion export\n`,
        );
      }

      await runFullPipeline({
        directory: targetDir,
        configPath: opts.config,
        noValidate: !opts.validate,
        provider: opts.provider,
        model: opts.model,
        consensus: opts.consensus,
        consensusPasses: opts.consensusPasses ? parseInt(opts.consensusPasses, 10) : undefined,
      });
    });
}

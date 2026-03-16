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
    .option('--no-llm', 'Skip LLM entirely for fast heuristic-only scan')
    .option('--no-validate', 'Skip LLM validation of findings')
    .option('--notion-export <path>', 'Path to Notion export directory')
    .option('--confluence-export <path>', 'Path to Confluence HTML export directory')
    .addHelpText('after', `
Examples:
  $ ody-refine ingest ./docs/                          Scan local files
  $ ody-refine ingest . --no-llm                       Fast heuristic-only
  $ ody-refine ingest --notion-export ./Export/         Notion export
  $ ody-refine ingest --confluence-export ./HMIS/       Confluence export
  $ ody-refine ./docs/                                 Shorthand

Notion exports: Export your Notion workspace as Markdown or HTML,
then point --notion-export at the exported directory.
`)
    .action(async (directory: string, opts: {
      config?: string; llm?: boolean; validate?: boolean;
      notionExport?: string; confluenceExport?: string;
    }) => {
      let targetDir = directory;

      // Handle Confluence export (directory or ZIP file)
      if (opts.confluenceExport) {
        let confluencePath = opts.confluenceExport;

        // If it's a ZIP file, extract first
        if (confluencePath.endsWith('.zip')) {
          const { execSync } = await import('node:child_process');
          const tmpExtract = join('.ody-refine', 'confluence-extract');
          mkdirSync(tmpExtract, { recursive: true });
          process.stdout.write('  Extracting ZIP archive...\n');
          execSync(`unzip -o -j "${confluencePath}" "*.html" -d "${tmpExtract}"`, { stdio: 'pipe' });
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
        noLlm: !opts.llm,
        noValidate: !opts.validate,
      });
    });
}

/**
 * Badge command — generate an SVG health badge for README embedding.
 * @module commands/badge
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner } from '../output/index.js';
import type { Detection } from '@useody/platform-core';

/** Compute health score 0-100. */
function healthScore(detections: Detection[]): number {
  const c = detections.filter((d) => d.severity === 'critical').length;
  const w = detections.filter((d) => d.severity === 'warning').length;
  const i = detections.filter((d) => d.severity === 'info').length;
  return Math.round(100 * Math.exp(-0.08 * c - 0.02 * w - 0.005 * i));
}

/** Generate shields.io-style SVG badge. */
function generateBadgeSvg(score: number): string {
  const label = 'knowledge health';
  const value = `${score}/100`;
  const color = score >= 80 ? '#4c1' : score >= 60 ? '#dfb317' : score >= 40 ? '#fe7d37' : '#e05d44';

  const labelWidth = label.length * 6.5 + 10;
  const valueWidth = value.length * 6.5 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/** Create the badge command. */
export function createBadgeCommand(): Command {
  return new Command('badge')
    .description('Generate an SVG health badge for your README')
    .option('--config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output SVG file path', 'knowledge-health.svg')
    .option('--svg', 'Output raw SVG to stdout')
    .addHelpText('after', `
Examples:
  $ ody-refine badge                          Generate badge file
  $ ody-refine badge --svg                    Print SVG to stdout
  $ ody-refine badge -o docs/badge.svg        Custom output path

Embed in README:
  ![Knowledge Health](./knowledge-health.svg)
`)
    .action(async (opts: { config?: string; output: string; svg?: boolean }) => {
      const spinner = createSpinner('Generating badge...');
      spinner.start();

      const config = loadConfig(opts.config);
      const dbPath = resolve(config.dataDir, 'refine.db');

      if (!existsSync(dbPath)) {
        spinner.fail(`No database found at ${dbPath}. Run 'ody-refine ingest' first.`);
        process.exitCode = 1;
        return;
      }

      try {
        const { loadDetections } = await import('../detect/detection-store.js');
        const core = await import('@useody/platform-core');
        const db = core.openDatabase(dbPath);

        const detections = loadDetections(db as never) ?? [];
        const score = healthScore(detections);
        const svg = generateBadgeSvg(score);

        if (opts.svg) {
          spinner.stop();
          process.stdout.write(svg);
          return;
        }

        const outPath = resolve(opts.output);
        writeFileSync(outPath, svg, 'utf-8');
        spinner.succeed(`Badge saved to ${outPath} (score: ${score}/100)`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Badge generation failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}

export { generateBadgeSvg, healthScore };

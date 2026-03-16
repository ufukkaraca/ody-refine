/**
 * File discovery for ingestion pipeline.
 * Recursively finds markdown and PDF files in a directory.
 * @module ingest/discover
 */
import { globSync } from 'glob';
import { resolve } from 'node:path';

/** Supported file extensions for ingestion. */
const SUPPORTED_PATTERNS = ['**/*.md', '**/*.pdf'];

/** Ignore patterns to skip common non-content directories. */
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.ody-refine/**',
];

/**
 * Discover all ingestible files in a directory.
 * Returns sorted absolute paths to all .md and .pdf files.
 */
export function discoverFiles(directory: string): string[] {
  const absDir = resolve(directory);

  const files = globSync(SUPPORTED_PATTERNS, {
    cwd: absDir,
    ignore: IGNORE_PATTERNS,
    nodir: true,
    absolute: true,
  });

  return files.sort();
}

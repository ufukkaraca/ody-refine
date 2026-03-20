/**
 * File hashing for change detection.
 * @module ingest/hasher
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Compute the SHA-256 hash of a file's content.
 * Used to detect whether a file has changed since last ingestion.
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

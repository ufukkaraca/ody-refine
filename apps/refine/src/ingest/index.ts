/**
 * Ingestion pipeline module.
 * @module ingest
 */
export { discoverFiles } from './discover.js';
export { chunkMarkdown, chunkPdf } from './chunker.js';
export type { Chunk } from './chunker.js';
export { extractFacts } from './extract-facts.js';
export type { FactExtractionResult } from './extract-facts.js';
export { hashFile } from './hasher.js';
export { ingestDirectory } from './pipeline.js';
export type {
  IngestOptions,
  IngestLog,
  IngestProgressEvent,
  IngestSummary,
} from './pipeline.js';
export { isFirecrawlAvailable, crawlWithFirecrawl } from './firecrawl-crawler.js';
export type { CrawlerBackend } from './web-crawler.js';

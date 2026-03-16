/**
 * Main ingestion pipeline orchestrator.
 * Discovers files, chunks content, embeds, extracts facts, and stores nodes.
 * @module ingest/pipeline
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import crypto from 'node:crypto';
import type {
  EdgeRepository,
  EmbeddingProvider,
  KnowledgeNode,
  LLMProvider,
  NodeRepository,
  VectorIndex,
} from '@useody/platform-core';
import { discoverFiles } from './discover.js';
import { chunkMarkdown, chunkPdf } from './chunker.js';
import { extractFacts } from './extract-facts.js';
import { hashFile } from './hasher.js';
import { reasonEdgesHeuristic, reasonEdgesWithLlm } from './reason-edges.js';
import { classifyDocTypeHeuristic } from './classify-doc-type.js';
import type { Chunk } from './chunker.js';

/** Options for the ingestion pipeline. */
export interface IngestOptions {
  directory: string;
  nodeRepo: NodeRepository;
  edgeRepo: EdgeRepository;
  vecIndex: VectorIndex;
  embeddingProvider: EmbeddingProvider;
  llm?: LLMProvider;
  ingestLog: IngestLog;
  onProgress?: (event: IngestProgressEvent) => void;
}

/** Interface for tracking ingested files (backed by SQLite ingest_log table). */
export interface IngestLog {
  getHash(filePath: string): Promise<string | null>;
  record(filePath: string, hash: string, nodeCount: number): Promise<void>;
}

/** Progress events emitted during ingestion. */
export interface IngestProgressEvent {
  phase: 'discover' | 'chunk' | 'embed' | 'extract' | 'store' | 'edges';
  file?: string;
  current: number;
  total: number;
}

/** Summary of an ingestion run. */
export interface IngestSummary {
  filesDiscovered: number;
  filesProcessed: number;
  filesSkipped: number;
  chunksCreated: number;
  nodesStored: number;
  edgesCreated: number;
}

const EMBED_BATCH_SIZE = 32;

/**
 * Run the full ingestion pipeline on a directory.
 * Discovers files, skips unchanged ones, chunks, embeds, extracts facts, and stores.
 */
export async function ingestDirectory(options: IngestOptions): Promise<IngestSummary> {
  const {
    directory, nodeRepo, edgeRepo, vecIndex, embeddingProvider,
    llm, ingestLog, onProgress,
  } = options;

  const files = discoverFiles(directory);
  const summary: IngestSummary = {
    filesDiscovered: files.length,
    filesProcessed: 0,
    filesSkipped: 0,
    chunksCreated: 0,
    nodesStored: 0,
    edgesCreated: 0,
  };

  onProgress?.({ phase: 'discover', current: files.length, total: files.length });

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]!;
    const hash = hashFile(filePath);
    const existingHash = await ingestLog.getHash(filePath);

    if (existingHash === hash) {
      summary.filesSkipped++;
      continue;
    }

    const chunks = await chunkFile(filePath);
    summary.chunksCreated += chunks.length;
    onProgress?.({ phase: 'chunk', file: filePath, current: i + 1, total: files.length });

    const nodes = await embedAndStore(
      chunks, filePath, embeddingProvider, llm, nodeRepo, vecIndex, onProgress, i, files.length,
    );
    summary.nodesStored += nodes.length;

    await ingestLog.record(filePath, hash, nodes.length);
    summary.filesProcessed++;
  }

  // After all files ingested, reason about relationships between nodes
  const allNodes = await nodeRepo.findAll();
  const edgeCount = llm
    ? await reasonEdgesWithLlm(allNodes, edgeRepo, vecIndex, llm, (current, total) => {
        onProgress?.({ phase: 'edges', current, total });
      })
    : await reasonEdgesHeuristic(allNodes, edgeRepo, vecIndex);
  summary.edgesCreated = edgeCount;
  onProgress?.({ phase: 'edges', current: allNodes.length, total: allNodes.length });

  return summary;
}

async function chunkFile(filePath: string): Promise<Chunk[]> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const buffer = readFileSync(filePath);
    return chunkPdf(buffer);
  }

  const content = readFileSync(filePath, 'utf-8');
  return chunkMarkdown(content);
}

async function embedAndStore(
  chunks: Chunk[],
  filePath: string,
  embeddingProvider: EmbeddingProvider,
  llm: LLMProvider | undefined,
  nodeRepo: NodeRepository,
  vecIndex: VectorIndex,
  onProgress: IngestOptions['onProgress'],
  fileIdx: number,
  totalFiles: number,
): Promise<KnowledgeNode[]> {
  const nodes: KnowledgeNode[] = [];

  for (let batch = 0; batch < chunks.length; batch += EMBED_BATCH_SIZE) {
    const batchChunks = chunks.slice(batch, batch + EMBED_BATCH_SIZE);
    const texts = batchChunks.map((c) => c.text);
    const embeddings = await embeddingProvider.embedBatch(texts);
    onProgress?.({ phase: 'embed', file: filePath, current: fileIdx + 1, total: totalFiles });

    for (let j = 0; j < batchChunks.length; j++) {
      const chunk = batchChunks[j]!;
      const embedding = embeddings[j]!;

      let facts: string[] | undefined;
      let entities: { name: string; type: string }[] | undefined;
      let docType: string | undefined;

      if (llm) {
        onProgress?.({ phase: 'extract', file: filePath, current: fileIdx + 1, total: totalFiles });
        const extracted = await extractFacts(chunk.text, llm);
        facts = extracted.facts.length > 0 ? extracted.facts : undefined;
        entities = extracted.entities.length > 0 ? extracted.entities : undefined;
        docType = extracted.docType;
      } else {
        docType = classifyDocTypeHeuristic(chunk.metadata.heading ?? basename(filePath), chunk.text);
      }

      const now = new Date();
      const node: KnowledgeNode = {
        id: crypto.randomUUID(),
        title: chunk.metadata.heading ?? basename(filePath),
        content: {
          summary: chunk.text.slice(0, 200),
          facts,
          entities,
          source: { sourceType: extname(filePath).slice(1), sourceId: filePath },
          raw: chunk.text,
        },
        embedding,
        embeddingModel: embeddingProvider.getModelId(),
        embeddingDim: embeddingProvider.getDimension(),
        confidence: 1.0,
        metadata: { charOffset: chunk.metadata.charOffset, pageNumber: chunk.metadata.pageNumber, docType },
        createdAt: now,
        updatedAt: now,
      };

      await nodeRepo.upsert(node);
      await vecIndex.add(node.id, embedding);
      nodes.push(node);
    }
  }

  onProgress?.({ phase: 'store', file: filePath, current: fileIdx + 1, total: totalFiles });
  return nodes;
}

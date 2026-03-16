# Multimodal Embedding Design

Status: Draft | Author: Elara | Date: 2026-03-15

## Context

The roadmap includes support for multimodal embedding models:
- **Gemini Embedding 2** (Google) — text + image, 768 dims
- **Mixedbread Wholembed v3** — text + image + code, 1024 dims

This doc describes what changes are needed across the stack.

## Current State

```
EmbeddingProvider interface:
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  getModelId(): string
  getDimension(): number
```

The interface is text-only. The ingest pipeline passes `string` text chunks.

## Required Changes

### 1. EmbeddingProvider Interface

Add a union input type. Keep backward compatibility for text-only providers.

```typescript
/** Input for embedding — text, image, or mixed. */
export type EmbeddingInput =
  | { type: 'text'; content: string }
  | { type: 'image'; content: Buffer; mimeType: string }
  | { type: 'mixed'; text: string; image: Buffer; mimeType: string };

export interface EmbeddingProvider {
  // Existing text-only methods (keep for backward compat)
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // New multimodal methods (optional — text-only providers don't implement)
  embedInput?(input: EmbeddingInput): Promise<number[]>;
  embedInputBatch?(inputs: EmbeddingInput[]): Promise<number[][]>;

  getModelId(): string;
  getDimension(): number;

  /** Whether this provider supports non-text modalities. */
  supportsModality?(modality: 'text' | 'image' | 'code'): boolean;
}
```

### 2. KnowledgeNode Changes

```typescript
export interface KnowledgeNode {
  // ... existing fields ...
  contentType: 'text' | 'image' | 'mixed'; // NEW — what was embedded
  imageRef?: string; // NEW — path/URL to source image if applicable
}
```

The `content.raw` field stays as string (text content). Images are stored as
references (file paths or URLs), not inline blobs.

### 3. Ingest Pipeline Changes

The chunker currently only handles markdown and PDF text. Changes needed:

1. **Image discovery** — detect `.png`, `.jpg`, `.svg` files in the target directory
2. **Image chunking** — each image becomes one chunk (no splitting)
3. **PDF image extraction** — extract embedded images from PDF pages
4. **Mixed chunking** — when a markdown file references an image, create a
   `mixed` input pairing the surrounding text with the image

The pipeline change is additive — text-only ingest works exactly as before.

### 4. SQLite Schema

No schema changes needed for embeddings (stored as BLOB regardless of modality).
Add `content_type TEXT DEFAULT 'text'` column to `knowledge_nodes`.

### 5. Vector Index

No changes needed. The vec0 virtual table stores float vectors regardless of
what generated them. Dimension is set at creation time and must match.

Cross-modality search works automatically — that's the point of multimodal
embeddings. A text query embedding will find semantically similar images.

## Implementation Phases

### Phase A: Interface + Provider (2-3 days)
- Add `EmbeddingInput` type and optional methods to interface
- Implement `GeminiEmbeddingProvider` with multimodal support
- Text-only providers unchanged (they just don't implement `embedInput`)

### Phase B: Pipeline (3-4 days)
- Add image discovery to `discoverFiles`
- Add image-as-chunk to chunker
- Wire `embedInput` through the pipeline when provider supports it
- Add `contentType` to `KnowledgeNode` and schema

### Phase C: Detection + Report (2 days)
- Detectors already work on node metadata, not raw embeddings
- Update HTML report to show image thumbnails for image-sourced detections

## Risks

1. **Model download size** — Gemini Embedding requires API key (no local model).
   Mixedbread may offer ONNX export but model is ~500MB.
2. **Dimension alignment** — all nodes in a database must use the same dimension.
   Switching from text-only (384) to multimodal (768) requires full re-embed.
3. **Image preprocessing** — some models expect specific image sizes/formats.
   Need a normalization step before embedding.

## Decision

Defer to Phase 2 (Forge). The current text-only interface is sufficient for
Refine CLI launch. The interface changes are backward-compatible and can be
added without breaking existing providers.

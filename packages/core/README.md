# @useody/platform-core

Core library for Ody Refine. Provides types, SQLite storage, vector search, and the detection runner.

## What's inside

- **Types** — `KnowledgeNode`, `KnowledgeEdge`, `Detection`, `DetectorFn`, `EmbeddingProvider`, `LLMProvider`
- **SQLite repositories** — `SQLiteNodeRepository`, `SQLiteEdgeRepository` with full CRUD
- **Vector search** — `SqliteVecIndex` using sqlite-vec for similarity queries
- **Detection runner** — `runDetection()` orchestrates detectors against the knowledge graph
- **Schema management** — `openDatabase()`, `createSchema()` for SQLite initialization

## Usage

```typescript
import {
  openDatabase,
  createSchema,
  SQLiteNodeRepository,
  SQLiteEdgeRepository,
  SqliteVecIndex,
  runDetection,
} from '@useody/platform-core';

const db = openDatabase('.ody-refine/refine.db');
createSchema(db, 384);

const nodeRepo = new SQLiteNodeRepository(db);
const edgeRepo = new SQLiteEdgeRepository(db);
const vecIndex = new SqliteVecIndex(db, 384);
```

## Design principles

- **Zero vendor imports** — LLM and embedding calls go through provider interfaces only
- **Pure functions** — Detectors have no side effects
- **SQLite-first** — No external database required

Part of [ody-platform](https://github.com/ufukkaraca/ody-platform). See the root [README](../../README.md) for setup.

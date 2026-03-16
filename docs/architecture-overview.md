# Ody Platform — Architecture Overview

> Author: Richard (RL Orchestrator / Systems Architect)
> Date: 2026-03-15
> Status: Architectural specification — defines package boundaries, deployment modes, and the continuous learning data flow

---

## 1. Dependency Tree

The platform is a monorepo with a strict acyclic dependency graph. Every arrow points downward — no package depends on something above it.

### 1.1 Package Graph

```
                          ┌──────────────────────────────┐
                          │  @useody/platform-core       │
                          │  (Apache 2.0, public npm)    │
                          │                              │
                          │  Types: KnowledgeNode,       │
                          │    KnowledgeEdge, Detection,  │
                          │    PreferencePair, LLMProvider,│
                          │    EmbeddingProvider,         │
                          │    NodeRepository,            │
                          │    EdgeRepository, VectorIndex│
                          │                              │
                          │  Impls: SQLite repos,        │
                          │    sqlite-vec VectorIndex,    │
                          │    transformers.js embedding, │
                          │    document loader            │
                          └──────┬──────┬──────┬─────────┘
                                 │      │      │
                    ┌────────────┘      │      └────────────┐
                    │                   │                    │
                    ▼                   ▼                    ▼
       ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
       │ @useody/       │  │ @useody/       │  │ @useody/feedback   │
       │ detectors      │  │ export         │  │ (private)          │
       │ (Apache 2.0)   │  │ (Apache 2.0)   │  │                    │
       │                │  │                │  │ SignalCollector,    │
       │ 5 pure-fn      │  │ JSONL, HTML,   │  │ ReputationTracker, │
       │ detectors      │  │ report gen     │  │ deriveReward,      │
       │                │  │                │  │ derivePreferencePair│
       └────────────────┘  └────────────────┘  └─────────┬──────────┘
                                                         │
                                                         │ (produces PreferencePairs)
                                                         │
                                               ┌─────────▼──────────┐
                                               │ @useody/training   │
                                               │ (private)          │
                                               │                    │
                                               │ DatasetRegistry,   │
                                               │ ModelRegistry,     │
                                               │ LocalTrainer,      │
                                               │ RetrainingOrchest. │
                                               └─────────┬──────────┘
                                                         │
                                               ┌─────────▼──────────┐
                                               │ @useody/eval       │
                                               │ (private)          │
                                               │                    │
                                               │ BenchmarkGenerator,│
                                               │ EvalRunner,        │
                                               │ EvalGate           │
                                               └────────────────────┘
```

### 1.2 Consumer Applications

```
ody-refine (CLI, Apache 2.0, public npm)
  ├── @useody/platform-core
  ├── @useody/detectors
  └── @useody/export

ody-forge (CLI, proprietary, future)
  ├── @useody/platform-core
  ├── @useody/training
  └── @useody/eval

ody-colleague (full stack, proprietary, future)
  ├── @useody/platform-core
  ├── @useody/detectors          ← same engine as Refine
  ├── @useody/export
  ├── @useody/feedback           ← closes the loop
  ├── @useody/training           ← embeds Forge
  ├── @useody/eval
  ├── source adapters (Slack, Notion, Confluence, etc.)  ← proprietary
  └── web UI (Next.js) + API (Express)                   ← proprietary
```

### 1.3 Key Insight: Colleague Contains Everything

The founder's observation is correct. Colleague's dependency tree is a superset:

```
Colleague ⊃ Forge ⊃ Refine's engine
```

Specifically:
- **Refine CLI** = `platform-core` + `detectors` + `export` + file loader + CLI UX
- **Forge CLI** = `platform-core` + `training` + `eval` + CLI UX
- **Colleague** = ALL of the above + `feedback` + source adapters + web UI + background workers

The CLI apps are thin shells around shared packages. The packages are the product. This means:
1. Bugs fixed in `detectors` improve both the CLI and Colleague simultaneously.
2. A user who runs Refine locally and later adopts Colleague gets identical detection quality.
3. The open source community improves the engine that powers the paid product.

### 1.4 Public vs. Private Boundary

```
PUBLIC (Apache 2.0, npm)          PRIVATE (proprietary)
─────────────────────             ────────────────────
@useody/platform-core             @useody/feedback
@useody/detectors                 @useody/training
@useody/export                    @useody/eval
ody-refine (CLI)                  ody-forge (CLI)
                                  ody-colleague (full stack)
                                  Source adapters (Slack, Notion, etc.)
                                  Web UI, API, background workers
```

The boundary is clean: everything needed to detect and report knowledge issues is public. Everything needed to learn from user corrections and train models is private. This is the right split — the detection engine builds trust and adoption; the learning loop is the monetization surface.

---

## 2. Two Deployment Modes

### Mode A: Standalone CLI (Zero Trust)

```
┌─────────────────────────────────────────────────────────────┐
│  User's machine                                             │
│                                                             │
│  ./docs/  ──► ody-refine ──► .ody-refine/refine.db (SQLite)│
│                   │                                         │
│                   ├── Ingest: load files → chunk → embed    │
│                   │   (transformers.js or Ollama)           │
│                   │                                         │
│                   ├── Detect: 5 detectors on loaded data    │
│                   │                                         │
│                   ├── Resolve: TUI for interactive fixes    │
│                   │                                         │
│                   └── Export: HTML report + JSONL dataset    │
│                                                             │
│  No network calls required (with transformers.js default).  │
│  Data never leaves the machine.                             │
│  One-shot execution. No daemon, no background process.      │
└─────────────────────────────────────────────────────────────┘
```

**Storage:** Single SQLite file (`.ody-refine/refine.db`) with embedded sqlite-vec for vector search. Nodes, edges, embeddings, detections — all in one file.

**Embedding:** transformers.js (`@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2`) runs in-process. True zero-config. Falls back to Ollama if detected, or user-configured cloud provider.

**Output:** HTML report opened in browser. JSONL export for downstream consumption (Forge, or any training pipeline).

### Mode B: Full Stack / Colleague (Continuous Learning)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Colleague Deployment (single cluster or multi-service)                  │
│                                                                          │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐  │
│  │  Source Adapters │    │  Web UI (Next.js) │    │  API (Express)     │  │
│  │  Slack bot       │    │  Audit dashboard  │    │  /ask, /feedback   │  │
│  │  Notion webhook  │    │  Resolution UI    │    │  /admin/retrain    │  │
│  │  Confluence sync │    │  Mind graph       │    │                    │  │
│  │  Linear/Jira     │    │  Safes editor     │    │                    │  │
│  └────────┬─────────┘    └────────┬─────────┘    └─────────┬──────────┘  │
│           │                       │                         │             │
│           ▼                       ▼                         ▼             │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Shared Postgres                                │  │
│  │  knowledge_nodes  │ knowledge_edges │ interaction_signals          │  │
│  │  preference_pairs │ training_runs   │ dataset_versions             │  │
│  │  registered_models│ reputation_scores│ domain_reputation           │  │
│  └───────────────────────────────┬────────────────────────────────────┘  │
│                                  │                                       │
│  ┌───────────────────────────────▼────────────────────────────────────┐  │
│  │              Background Workers (BullMQ / cron)                    │  │
│  │                                                                    │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Ingestion    │  │ Detection     │  │ Retraining Orchestrator │ │  │
│  │  │ Worker       │  │ Worker        │  │                         │ │  │
│  │  │              │  │               │  │ Trigger check (6h)      │ │  │
│  │  │ distill()    │  │ Run detectors │  │ Dataset build           │ │  │
│  │  │ → Node       │  │ on new/changed│  │ DPO training            │ │  │
│  │  │ → store      │  │ node batches  │  │ Eval gate               │ │  │
│  │  │ → queue edge │  │               │  │ Model deploy            │ │  │
│  │  │   reasoning  │  │               │  │                         │ │  │
│  │  └──────────────┘  └───────────────┘  └─────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Storage:** Postgres with pgvector. Same repository interfaces as Mode A — the `NodeRepository` and `EdgeRepository` implementations swap from SQLite to Postgres, but the detector functions, feedback logic, and training pipeline are identical.

**Key difference from Mode A:** Data flows continuously (not one-shot), feedback signals close the loop, and retraining runs as a background process.

---

## 3. Continuous Learning Data Flow

This is the exact path from a user correction to a deployed model update.

### 3.1 Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: User Interacts                                                  │
│                                                                         │
│   User asks Colleague a question                                        │
│     → RAG retrieves relevant KnowledgeNodes from Postgres               │
│     → Model v(N) generates response citing those nodes                  │
│     → Response displayed with source attributions                       │
│                                                                         │
│   User corrects the answer: "Actually, the deadline moved to Q4"        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Signal Collection                                               │
│                                                                         │
│   SignalCollector.record({                                               │
│     signalType: 'corrected',                                            │
│     userId: 'user-123',                                                 │
│     conversationId: 'conv-456',                                         │
│     turnId: 'turn-789',                                                 │
│     correctionText: 'The deadline moved to Q4',                         │
│     questionNodeIds: ['node-A', 'node-B'],   // nodes cited in response │
│     timeToActionMs: 4200,                                               │
│     reputationWeight: 0.85,                                             │
│   })                                                                    │
│                                                                         │
│   → Stored in interaction_signals table (Postgres)                      │
│   → MUST also store: original question, retrieved context, model answer │
│     (these are needed to reconstruct the full prompt for training)       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Reward Derivation                                               │
│                                                                         │
│   deriveReward(signal, reputation) → RewardDerivation                   │
│                                                                         │
│   For 'corrected' signal with reputation 0.85:                          │
│     reward = -0.9 × 0.85 = -0.765 (strong negative — model was wrong)  │
│     preferencePairGenerated = true (reputation >= 0.4 threshold)        │
│                                                                         │
│   derivePreferencePair(signal, originalQuestion, context, modelAnswer,  │
│                         correctionText, reputation)                     │
│     → PreferencePair {                                                  │
│         prompt: "What is the deployment deadline?" // actual question   │
│         chosen: "The deadline moved to Q4"         // user's correction │
│         rejected: "The deadline is Q3 2026"        // model's answer    │
│         metadata: {                                                     │
│           confidence: 0.85,                                             │
│           resolvedBy: 'user-123',                                       │
│           resolvedAt: 2026-03-15T14:30:00Z,                            │
│           conflictType: 'contradiction',                                │
│           sourceNodeIds: ['node-A', 'node-B'],                          │
│           retrievedContext: '...',  // for training reconstruction      │
│         }                                                               │
│       }                                                                 │
│                                                                         │
│   → Stored in preference_pairs table                                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Trigger Check (background job, every 6 hours)                   │
│                                                                         │
│   RetrainingTrigger.computeScore(pairsSinceLastTraining):               │
│                                                                         │
│   trigger_score = Σ (pair.confidence × recency_factor)                  │
│     where recency_factor = e^(-days_since_creation / 7)                 │
│                                                                         │
│   shouldTrigger(score, lastTrainingAt):                                 │
│     1. Cooldown check: >= 24 hours since last training run?             │
│     2. Score check: trigger_score >= 50.0?                              │
│        (~60 high-confidence pairs, or ~120 medium-confidence pairs)     │
│     3. Both must be true to proceed.                                    │
│                                                                         │
│   If NO: wait. Check again in 6 hours.                                  │
│   If YES: start retraining pipeline ──►                                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Dataset Build                                                   │
│                                                                         │
│   RetrainingOrchestrator.buildDataset(parentVersionId):                 │
│                                                                         │
│   1. Collect all NEW preference pairs since last dataset version        │
│   2. Sample 20% replay from parent dataset (catastrophic forgetting     │
│      defense — forces model to maintain performance on older material)  │
│   3. Merge new pairs + replay pairs                                     │
│   4. Hold out eval set (from benchmark generation on latest nodes)      │
│   5. Register as DatasetVersion {                                       │
│        version: 'v4',                                                   │
│        preferencePairCount: 180,  // 150 new + 30 replay                │
│        lineage: { parentVersionId: 'v3', sourceType: 'incremental' }   │
│      }                                                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Training                                                        │
│                                                                         │
│   LocalTrainer.train(config):                                           │
│                                                                         │
│   Method: DPO (Direct Preference Optimization)                          │
│   Base model: frozen (e.g., Qwen2.5-7B-Instruct)                       │
│   Trainable: LoRA adapter only (r=16, α=32, targets: q/k/v/o_proj)     │
│   Reference model: base model (no separate copy needed with LoRA)       │
│                                                                         │
│   Produces: LoRA adapter weights (safetensors format, ~50-100MB)        │
│   Stored at: artifacts/{dataset_id}/{run_id}/adapter/                   │
│                                                                         │
│   For first-ever run: SFT stage first (on knowledge Q&A pairs from     │
│   nodes), then DPO on preference pairs. Subsequent runs: DPO only.     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Evaluation Gate (HARD — no auto-override)                       │
│                                                                         │
│   1. Generate benchmark from latest high-confidence nodes               │
│   2. Run benchmark against CANDIDATE model (v4)                         │
│   3. Run benchmark against CURRENT deployed model (v3)                  │
│   4. Compare on ALL metrics:                                            │
│      - accuracy (keyword overlap — to be replaced with semantic)        │
│      - semanticSimilarity (embedding-based comparison)                  │
│      - contradictionRate (does model contradict sources?)               │
│      - factualConsistency (does model hallucinate?)                     │
│   5. Per-domain regression check:                                       │
│      for each domain d:                                                 │
│        candidate.scores[d] >= current.scores[d] - 0.05 tolerance       │
│                                                                         │
│   evaluateGate(currentEval, candidateEval):                             │
│     PASS: candidate >= current on ALL aggregate + per-domain metrics    │
│     FAIL: candidate regresses on ANY metric → block, alert admin        │
│           Manual override: ody-forge model deploy v4 --force            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                          ┌─────┴─────┐
                          │           │
                        FAIL        PASS
                          │           │
                          ▼           ▼
                    Keep model   Deploy new model
                    v(N),        v(N+1):
                    log warning  ┌───────────────────────────┐
                                 │ ModelRegistry.update():   │
                                 │   v(N+1): ready → deployed│
                                 │   v(N):   deployed → retired│
                                 │                           │
                                 │ Conversation pinning:     │
                                 │   Active convos stay on v(N)│
                                 │   New convos get v(N+1)   │
                                 └───────────────────────────┘
```

### 3.2 Where Does This Run?

**Inside Colleague's deployment.** The retraining pipeline is NOT a separate service. It runs as a background worker within the same deployment:

```
Colleague deployment
  ├── Web server (API + UI)         ← handles user interactions
  ├── Ingestion worker              ← processes new source data
  ├── Detection worker              ← runs periodic detector sweeps
  ├── Feedback worker               ← derives rewards + preference pairs
  └── Retraining worker             ← the full pipeline (Steps 5-7)
```

The retraining worker is the heaviest — it spawns a Python subprocess for the actual DPO training. For self-hosted Colleague, this requires a GPU on the same machine or a reachable GPU endpoint. For managed Colleague, this dispatches to a cloud GPU provider (Prime Intellect or equivalent).

**Why not a separate service?** Because the retraining pipeline reads from the same Postgres database that stores feedback. Splitting it into a separate service adds network latency, auth complexity, and deployment coordination — all for zero architectural benefit. The worker queue (BullMQ) already provides job isolation and retry semantics.

The one exception: if training compute is remote (cloud GPU), the training step itself runs remotely, but the orchestration (trigger check, dataset build, eval gate, model registration) still runs inside Colleague.

---

## 4. Colleague's Ingestion Architecture

### 4.1 Live Data Flow

When Colleague receives data from a live source (Slack message, Notion page update, etc.), the processing is **async and batched**, not synchronous per-message.

```
┌────────────────────────────────────────────────────────────────────────┐
│ INGESTION: Per-event, lightweight                                      │
│                                                                        │
│ Slack message received (bot event API)                                 │
│   │                                                                    │
│   ▼                                                                    │
│ Source adapter: distillChatMessage(message)                             │
│   → Extracts: summary, facts, entities, source ref                     │
│   → Produces: KnowledgeNode (without embedding yet)                    │
│   │                                                                    │
│   ▼                                                                    │
│ Embedding: embed(node.content.summary)                                 │
│   → Adds embedding vector to the node                                  │
│   │                                                                    │
│   ▼                                                                    │
│ Store: NodeRepository.upsert(node) → Postgres                          │
│   → Node is now searchable via vector similarity                       │
│   │                                                                    │
│   ▼                                                                    │
│ Queue: enqueue node ID for edge reasoning batch                        │
│   → Returns immediately. Distillation complete.                        │
│                                                                        │
│ Latency: ~200-500ms per message (dominated by embedding call)          │
│ This runs synchronously on the event — every message gets a node.      │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 │ (node IDs accumulate in queue)
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ EDGE REASONING: Batched, every 5 minutes                               │
│                                                                        │
│ Background job picks up queued node IDs (batch of up to 50)            │
│   │                                                                    │
│   ▼                                                                    │
│ For each new node:                                                     │
│   VectorIndex.search(node.embedding, topK=20, minSimilarity=0.7)       │
│   → Find similar existing nodes                                        │
│   │                                                                    │
│   ▼                                                                    │
│ reasonClaimRelationships(newNode, similarNodes, llm)                    │
│   → LLM determines: contradicts? supersedes? depends_on? related?      │
│   → Creates KnowledgeEdge for each identified relationship             │
│   │                                                                    │
│   ▼                                                                    │
│ EdgeRepository.upsert(edges)                                           │
│   → Relationships stored in Postgres                                   │
│                                                                        │
│ Why batched? Edge reasoning requires LLM calls (expensive, slow).      │
│ Batching amortizes overhead and prevents rate-limit exhaustion.         │
│ 5-minute cadence balances freshness with cost.                          │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 │ (edges accumulate)
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ DETECTION: Periodic sweep, every 30 minutes                            │
│                                                                        │
│ Detection worker runs ALL 5 detectors:                                 │
│   │                                                                    │
│   ├── contradiction detector: walk 'contradicts' edges, confirm via LLM│
│   ├── duplicate detector: cluster high-similarity nodes                │
│   ├── staleness detector: check source.lastModified + confidence decay │
│   ├── undocumented detector: high mention count, no authoritative doc  │
│   └── time_bomb detector: scan for date references, compare to now     │
│   │                                                                    │
│   ▼                                                                    │
│ New Detection[] → stored in detections table                           │
│   → Appear in audit dashboard in real-time                             │
│   → Critical detections trigger Slack notification to admins           │
│                                                                        │
│ Why periodic, not per-edge? Detectors are designed as batch operations │
│ over the full node+edge graph. Running per-edge would miss patterns    │
│ that only emerge from global analysis (e.g., duplicate clusters).      │
│ 30-minute cadence is near-real-time for knowledge drift detection.     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Processing Cadences Summary

| Stage | Trigger | Latency | Why |
|-------|---------|---------|-----|
| **Distillation** | Per-event (synchronous) | ~200-500ms | Every message deserves a node. Cheap. |
| **Edge reasoning** | Batch, every 5 min | ~2-10s per node | LLM calls are expensive. Batch amortizes. |
| **Detection** | Periodic sweep, every 30 min | ~30-120s full sweep | Detectors need global graph view. |
| **Retraining trigger** | Cron, every 6 hours | ~1s (just a DB query) | Training is expensive. Don't over-trigger. |
| **Retraining pipeline** | On trigger (if threshold met) | ~30-120 min | GPU training dominates. |

### 4.3 Difference from Refine CLI

In the CLI, ALL stages run sequentially in one process:

```
CLI: ingest ALL files → embed ALL → reason ALL edges → detect ALL → report
```

In Colleague, each stage runs independently at its own cadence:

```
Colleague: ingest continuously → edge-reason in batches → detect periodically
```

Same engine, different execution model. The detector functions are identical — they receive `(nodes, edges, llm?)` and return `Detection[]` regardless of whether the data came from a local markdown file or a Slack message.

---

## 5. Clear Boundaries

### 5.1 What Ships in Each Product

```
REFINE CLI (open source, Apache 2.0)
├── @useody/platform-core     ← types, SQLite repos, vector index, loader
├── @useody/detectors         ← 5 detector functions
├── @useody/export            ← HTML report, JSONL export
├── CLI UX                    ← commander, ink TUI, chalk
└── File loaders              ← markdown, PDF, TOML, JSON

FORGE CLI (proprietary)
├── @useody/platform-core     ← types only (no SQLite needed)
├── @useody/training          ← dataset registry, model registry, trainer
├── @useody/eval              ← benchmark generation, eval runner, gate
└── CLI UX                    ← commander

COLLEAGUE (proprietary)
├── Everything from Refine    ← same detection engine
├── Everything from Forge     ← same training pipeline
├── @useody/feedback          ← signal collection, reward derivation
├── Source adapters            ← Slack, Notion, Confluence, Linear, Jira, Gmail, Teams
├── Web UI                    ← Next.js (audit dashboard, resolution UI, Safes editor)
├── API server                ← Express (REST endpoints)
├── Background workers        ← BullMQ (ingestion, detection, retraining)
└── Postgres + pgvector       ← production storage backend
```

### 5.2 The "Library, Not CLI" Principle

Refine's value is in its packages, not its CLI binary. The CLI is one consumer. Colleague is another. A third-party tool could import `@useody/detectors` and build their own UI.

This means:
- **Packages must have zero CLI dependencies.** No `chalk`, no `commander`, no `ink` in library code.
- **Packages must be storage-agnostic.** Accept `NodeRepository` interface, not `SQLiteNodeRepository` concrete class.
- **Packages must be provider-agnostic.** Accept `LLMProvider` / `EmbeddingProvider` interfaces, not specific SDKs.

These constraints are already enforced by the coding conventions (rule 3: zero vendor SDK imports in core/detectors).

---

## 6. Risks and Recommendations

### 6.1 Circular Dependency Risk

**Current status: clean.** The dependency graph is a strict DAG. No cycles exist. But there is one architectural pressure point:

**Risk:** `feedback` → `training` dependency could become bidirectional. The retraining orchestrator (in `training`) needs to read preference pairs (from `feedback`). If the orchestrator also needs to update feedback state (e.g., mark pairs as "consumed by training run X"), `training` would need to import from `feedback` — creating a cycle.

**Recommendation:** The orchestrator should accept a `PreferencePairSource` interface (defined in `platform-core` or `training`), not import `feedback` directly. The feedback package implements this interface, and Colleague's dependency injection wires them together at startup. The packages never know about each other.

```typescript
// In @useody/training (or @useody/platform-core)
interface PreferencePairSource {
  getNewPairs(since: Date): Promise<PreferencePair[]>;
  markConsumed(pairIds: string[], datasetVersionId: string): Promise<void>;
}

// In @useody/feedback — implements the interface
class FeedbackPairSource implements PreferencePairSource { ... }

// In Colleague startup — wires them together
const pairSource = new FeedbackPairSource(db);
const orchestrator = new RetrainingOrchestrator(pairSource, trainer, evalRunner);
```

### 6.2 Retraining Trigger Granularity

**Risk:** The current plan uses a fixed threshold (trigger_score >= 50.0) with a 24-hour cooldown. This is reasonable for early deployment but will need adaptation.

**Recommendation:**
- **Early stage (< 1000 total pairs):** Lower threshold (30.0), longer cooldown (48h). Data is precious; train on smaller batches but less frequently. Each training run is exploratory.
- **Growth stage (1000-10000 pairs):** Current settings (50.0 threshold, 24h cooldown). Enough data for stable DPO training.
- **Mature stage (10000+ pairs):** Higher threshold (100.0), shorter cooldown (12h). More data means each increment is smaller relative to total — need larger batches to move the needle.

Make the threshold and cooldown configurable per-tenant. Different organizations will accumulate feedback at different rates.

### 6.3 Sync vs. Async Detection

**Recommendation: Async (periodic batch), not sync (per-event).**

Running detectors synchronously on each ingested message would:
1. Add 5-30 seconds latency to every Slack message processing (unacceptable for real-time bot)
2. Produce incomplete results — detectors need graph context, not just the latest node
3. Waste compute — most individual messages don't create new contradictions

The 30-minute periodic sweep is the right default. For customers who need faster detection (e.g., compliance use cases), offer a configurable sweep interval down to 5 minutes. Never go synchronous.

### 6.4 Model Version Transitions in Active Conversations

**Risk:** When model v(N+1) deploys, active conversations are pinned to v(N). But what happens when:
- v(N) is retired and its adapter is garbage-collected?
- A conversation spans days and multiple model versions deploy?
- The user expects consistent quality within a session?

**Recommendation:**
1. **Pin at conversation start.** The model version is recorded in the conversation metadata when the first turn is created. All subsequent turns use that version.
2. **Never garbage-collect adapters with active conversations.** Track conversation→model_version associations. Only garbage-collect adapters when zero active conversations reference them. An "active" conversation is one with activity in the last 7 days.
3. **Offer explicit upgrade.** In the UI, show a subtle indicator: "A newer model is available." The user can opt to upgrade mid-conversation. This creates a natural breakpoint — the user understands quality may shift.
4. **Store adapter artifacts permanently** (they're small — 50-100MB per LoRA). Disk is cheap. Model lineage is valuable. Don't delete.

### 6.5 Training Compute Isolation

**Risk:** The retraining worker spawns a Python subprocess with GPU access. If this runs on the same machine as the web server, a training run could starve the API of memory/compute.

**Recommendation for self-hosted:** Document that training requires a separate GPU-equipped machine or container. The retraining worker should connect to a training endpoint (local or remote), not spawn a subprocess on the web server.

**Recommendation for managed:** Dispatch training to an ephemeral GPU instance (Prime Intellect, Lambda, etc.). The orchestrator sends the dataset, waits for completion, receives the adapter. No GPU on the Colleague server itself.

### 6.6 Feedback Data Poisoning

**Risk:** A malicious or confused user could submit corrections that degrade model quality.

**Mitigations already in place:**
- Reputation weighting (low-rep users' corrections are discounted)
- Admin review queue for users with reputation < 0.4
- Eval gate catches model regression before deployment

**Additional recommendation:** Add a **correction conflict detector** that flags when two trusted users correct the same answer differently. This is already spec'd in `packages/feedback/src/conflict-detector.ts` but has no resolution policy. Implement: higher reputation wins, with the conflict logged for admin review. Both corrections stored for audit trail.

---

## 7. Summary: The Architectural Bet

The platform makes one central bet: **the same engine that detects knowledge issues for a CLI user can close a continuous learning loop for an enterprise deployment.** The detector functions, the knowledge graph model, and the preference pair format are shared across all three products. What changes is the data source (local files vs. live integrations), the storage backend (SQLite vs. Postgres), and the feedback loop (one-shot vs. continuous).

This bet pays off if:
1. The open source packages are genuinely useful standalone (Refine CLI succeeds)
2. The interface boundaries hold under production load (Colleague doesn't need to fork the engine)
3. The continuous learning loop actually improves model quality (Forge produces real value)

The architecture supports all three. The dependency graph is clean. The boundaries are well-defined. The risks are manageable. Build it.

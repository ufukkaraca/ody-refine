<p align="center">
  <h1 align="center">Ody Refine</h1>
  <p align="center">
    The ESLint for enterprise knowledge &mdash; finds contradictions before your team does.
  </p>
</p>

<p align="center">
  <a href="https://github.com/rodyr/ody-platform/actions"><img src="https://img.shields.io/github/actions/workflow/status/rodyr/ody-platform/ci.yml?branch=main&style=flat-square" alt="CI"></a>
  <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/v/ody-refine?style=flat-square&color=blue" alt="npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node"></a>
</p>

---

Point it at your docs. Get a health report in 2 minutes. **Runs locally. Your data never leaves your machine.**

```bash
npx ody-refine ./docs/
```

```
  Ingestion Summary
  ────────────────────────────────────────
    Files discovered:  47
    Files processed:   43
    Chunks created:    186
    Nodes stored:      186

  Detection Summary
  ────────────────────────────────────────
    Total issues:   12
    Critical:       3
    Warnings:       5
    Info:           4

  ✖ [contradiction] "Rate limits" defined as 1,000 req/min in API docs
                     but 500 req/min in engineering handbook
  ✖ [contradiction] Refund policy in support playbook conflicts with
                     customer-facing terms of service
  ✖ [contradiction] Deploy process documented in 3 places with 3
                     different approval chains
  ⚠ [staleness]     "Weekly design sync" last mentioned 4 months ago
  ⚠ [staleness]     Q3 OKRs still referenced as "current" in onboarding doc
  ⚠ [duplicate]     PTO policy documented in handbook AND wiki with
                     different details
  ⚠ [time_bomb]     SLA with Acme Corp expires in 14 days — no renewal
                     doc exists
  ⚠ [staleness]     Incident runbook references deprecated monitoring tool
  ℹ [undocumented]  "We decided to drop Python support" — found in Slack,
                     never written down
  ℹ [undocumented]  Pricing change discussed in meeting notes, not in
                     product docs
  ℹ [time_bomb]     SOC 2 audit deadline approaching, prep checklist missing
  ℹ [undocumented]  On-call rotation agreement exists only in a thread

  Report: .ody-refine/report.html
```

The HTML report opens automatically in your browser:

<p align="center">
  <img src="./ody-report-screenshot.png" alt="Ody Refine Health Report" width="600">
</p>

---

## What it finds

| Detector | What it catches | Real example |
|----------|----------------|--------------|
| **Contradictions** | Two sources disagree on the same topic | API docs say 1,000 req/min, handbook says 500 |
| **Staleness** | Commitments and processes that went stale | "Weekly sync" hasn't happened in 4 months |
| **Duplicates** | Same knowledge in multiple places, drifting apart | PTO policy in wiki AND handbook, different rules |
| **Undocumented** | Decisions made in conversations, never written down | "We dropped Python support" -- only in a Slack thread |
| **Time Bombs** | Deadlines and SLAs approaching with no action | SLA expires in 14 days, no renewal doc exists |

Every detection includes a severity level, the specific documents involved, and a suggested action.

---

## How it works

```
Your Docs   -->   Chunk   -->   Embed   -->   Detect   -->   Report

 .md .pdf .txt    By heading     Ollama     5 built-in     HTML report
 .docx .rst       or paragraph   (local)    detectors      + terminal
                                 OpenAI                    health score
                                 Cohere
```

1. **Ingest** -- Reads your docs, splits by headings/paragraphs, extracts facts and entities
2. **Embed** -- Generates vector embeddings locally via [Ollama](https://ollama.com) (or OpenAI/Cohere)
3. **Detect** -- Runs 5 pure-function detectors against the knowledge graph
4. **Report** -- Produces an HTML health report with a score and every finding

Everything stored in a local SQLite database at `.ody-refine/refine.db`. Zero cloud. Zero login.

---

## Quick start

### Option A: Ollama (recommended -- fully local)

```bash
# 1. Install Ollama (https://ollama.com)
ollama pull nomic-embed-text
ollama pull llama3.2

# 2. Run
npx ody-refine ./docs/
```

### Option B: OpenAI

```bash
export ODY_EMBEDDING_PROVIDER=openai
export ODY_EMBEDDING_MODEL=text-embedding-3-small
export ODY_EMBEDDING_API_KEY=sk-...

npx ody-refine ./docs/
```

### Option C: Install globally

```bash
npm install -g ody-refine
ody-refine ./docs/
```

---

## CLI commands

```bash
ody-refine <path>               # Full pipeline: ingest -> detect -> report
ody-refine ingest <path>        # Ingest documents only
ody-refine detect               # Run detectors on ingested data
ody-refine report               # Generate HTML report
ody-refine resolve              # Interactive TUI to resolve issues
ody-refine export               # Export clean data as JSONL
ody-refine status               # Show database stats
ody-refine config set <k> <v>   # Update configuration
```

---

## Configuration

Config file at `~/.config/ody-refine/config.toml`:

```toml
# Embedding provider: ollama (default), openai, cohere
[embedding]
provider = "ollama"
model = "nomic-embed-text"

# LLM provider (optional — improves detection quality)
[llm]
provider = "ollama"
model = "llama3.2"

# Ollama connection
[ollama]
baseUrl = "http://localhost:11434"
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ODY_EMBEDDING_PROVIDER` | `ollama`, `openai`, or `cohere` |
| `ODY_EMBEDDING_MODEL` | Model name (e.g. `nomic-embed-text`) |
| `ODY_EMBEDDING_API_KEY` | API key for OpenAI or Cohere |
| `ODY_LLM_PROVIDER` | `ollama`, `openai`, or `anthropic` |
| `ODY_LLM_MODEL` | Model name (e.g. `llama3.2`) |
| `ODY_LLM_API_KEY` | API key for LLM provider |

Precedence: defaults < config file < environment variables.

---

## GitHub Action

Add knowledge health checks to your CI:

```yaml
# .github/workflows/knowledge-check.yml
name: Knowledge Health Check
on:
  pull_request:
    paths: ['docs/**', '*.md']

jobs:
  refine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx ody-refine ./docs/ --ci
```

Fail the build when contradictions land in your docs -- the same way ESLint fails on code issues.

---

## Architecture

```
ody-platform/
├── packages/
│   ├── core/           @ody/platform-core  — types, SQLite, vector search, providers
│   ├── detectors/      @ody/detectors      — 5 pure-function detectors
│   └── export/         @ody/export         — HTML report, JSONL export
├── apps/
│   └── refine/         ody-refine          — CLI application
└── .ody-refine/        (created at runtime — SQLite DB + reports)
```

Detectors are pure functions with zero side effects: `(nodes, edges, llm?) -> Detection[]`. Build your own:

```typescript
import type { DetectorFn } from '@ody/platform-core';

const detectCustomIssue: DetectorFn = async (nodes, edges, llm) => {
  // Your detection logic here
  return [];
};

detectCustomIssue.preFilter = { similarityThreshold: 0.6, topK: 10 };
```

---

## The bigger picture

Ody Refine is the open-source foundation of the [Ody](https://useody.com) platform:

```
Zero Trust              Partial Trust           Full Product
────────────────────    ────────────────────    ────────────────────
Ody Refine (CLI)    ->  Ody Forge           ->  Ody Colleague

Runs locally             Your data,              Your model,
No login                 our training pipeline    your answers
Free & open source       Model artifact is yours  Self-improving
```

**Refine** finds what's broken. **Forge** trains a model on your clean data. **Colleague** is an AI assistant powered by YOUR model -- not a generic one.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, code style, and PR process.

```bash
git clone https://github.com/rodyr/ody-platform.git
cd ody-platform
pnpm install
pnpm verify    # lint + typecheck + test
```

---

## License

[Apache 2.0](./LICENSE)

---

<p align="center">
  <strong>Ody</strong> -- Self-Trained Intelligence for Every Team
  <br>
  <a href="https://useody.com">useody.com</a>
  <br><br>
  Built by <a href="https://github.com/rodyr">Rodyr</a> in Berlin & San Francisco
</p>

<p align="center">
  <h1 align="center">Ody Refine</h1>
  <p align="center">
    Find contradictions in your docs before your team does.
  </p>
</p>

<p align="center">
  <a href="https://github.com/rodyr/ody-platform/actions"><img src="https://img.shields.io/github/actions/workflow/status/rodyr/ody-platform/ci.yml?branch=main&style=flat-square" alt="CI"></a>
  <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/v/ody-refine?style=flat-square&color=blue" alt="npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node"></a>
</p>

---

**Your docs say one thing. Your wiki says another. Nobody notices until a customer does.**

Ody Refine scans your documentation and finds contradictions, stale processes, and undocumented decisions. Runs locally. Your data never leaves your machine.

```bash
npx ody-refine ./docs/
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ody refine  ·  47 files  ·  2.1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ██████░░░░  62/100 Needs attention

  3 critical  ·  5 warnings  ·  4 info

────────────────────────────────────────────────────────
 CRITICAL (3)
────────────────────────────────────────────────────────
  ✖ [contradiction] Rate limits: 1,000 req/min in API docs vs 500 in handbook
  ✖ [contradiction] Refund policy conflicts between support playbook and ToS
  ✖ [contradiction] Deploy process: 3 docs, 3 different approval chains

────────────────────────────────────────────────────────
 WARNINGS (5)
────────────────────────────────────────────────────────
  ⚠ [staleness]   "Weekly design sync" last mentioned 4 months ago
  ⚠ [staleness]   Q3 OKRs still referenced as "current" in onboarding doc
  ⚠ [duplicate]   PTO policy in handbook AND wiki with different details
  ⚠ [time_bomb]   SLA with Acme Corp expires in 14 days — no renewal doc
  ⚠ [staleness]   Incident runbook references deprecated monitoring tool

────────────────────────────────────────────────────────
 What to do next
────────────────────────────────────────────────────────
  1. Open report    open .ody-refine/report.html
  2. Resolve issues ody-refine resolve
  3. Re-scan        ody-refine ingest .

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## What it finds

| Detector | What it catches | Example |
|----------|----------------|---------|
| **Contradictions** | Two docs disagree on the same fact | API docs say 1,000 req/min, handbook says 500 |
| **Staleness** | Processes and commitments that went quiet | "Weekly sync" — last mentioned 4 months ago |
| **Duplicates** | Same topic in multiple places, drifting apart | PTO policy in wiki AND handbook, different rules |
| **Undocumented** | Decisions made in chat, never written down | "We dropped Python support" — only in Slack |
| **Time Bombs** | Deadlines approaching with no action | SLA expires in 14 days, no renewal doc exists |

---

## Quick start

**Prerequisite:** [Node.js 20+](https://nodejs.org)

```bash
npx ody-refine ./docs/
```

That's it. On first run, Ody downloads a small embedding model (~23 MB) automatically. No accounts, no API keys, no configuration.

### With Ollama (better results)

```bash
# Install Ollama: https://ollama.com
ollama pull nomic-embed-text
ollama pull llama3.2

npx ody-refine ./docs/
```

Ollama is auto-detected. Adding an LLM improves detection quality and filters false positives.

### With OpenAI

```bash
export ODY_EMBEDDING_PROVIDER=openai
export ODY_EMBEDDING_API_KEY=sk-...
npx ody-refine ./docs/
```

---

## CLI

```bash
ody-refine <path>               # Full pipeline: ingest + detect + report
ody-refine ingest <path>        # Ingest docs only
ody-refine detect               # Run detectors on existing data
ody-refine report               # Generate HTML health report
ody-refine resolve              # Interactive TUI to triage issues
ody-refine export               # Export data as JSONL
ody-refine status               # Show database stats
ody-refine ci ./docs/           # CI mode: JSON output, exit codes
ody-refine scan <url>           # Crawl and scan public docs
ody-refine config show          # Show configuration
```

---

## How it works

```
 Your Docs        Chunk          Embed           Detect          Report
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ .md .pdf │──>│ Heading & │──>│ Local or │──>│ 5 pure   │──>│ HTML +   │
│ .txt     │   │ paragraph│   │ cloud    │   │ function │   │ terminal │
│ .docx    │   │ splitting│   │ vectors  │   │ detectors│   │ + CI JSON│
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

1. **Ingest** — Reads your docs, splits by headings, extracts facts
2. **Embed** — Generates vector embeddings (local by default, or OpenAI/Cohere)
3. **Detect** — Runs 5 pure-function detectors against the knowledge graph
4. **Report** — Produces an HTML report with score and every finding

Everything stored in a local SQLite database at `.ody-refine/`. Zero cloud. Zero login.

---

## GitHub Action

```yaml
# .github/workflows/knowledge-check.yml
name: Knowledge Health
on:
  pull_request:
    paths: ['docs/**', '*.md']

jobs:
  refine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx ody-refine ci ./docs/ --min-health 70
```

Fail the build when contradictions land in your docs.

---

## Configuration

Config file at `~/.config/ody-refine/config.toml`:

```toml
[embedding]
provider = "ollama"
model = "nomic-embed-text"

[llm]
provider = "ollama"
model = "llama3.2"

[ollama]
baseUrl = "http://localhost:11434"
```

| Variable | Description |
|----------|-------------|
| `ODY_EMBEDDING_PROVIDER` | `ollama`, `openai`, or `cohere` |
| `ODY_EMBEDDING_API_KEY` | API key for OpenAI or Cohere |
| `ODY_LLM_PROVIDER` | `ollama`, `openai`, or `anthropic` |
| `ODY_LLM_API_KEY` | API key for LLM provider |

Precedence: defaults < config file < environment variables.

---

## Architecture

```
ody-platform/
├── packages/
│   ├── core/           @useody/platform-core  — types, SQLite, vector search
│   ├── detectors/      @useody/detectors      — 5 pure-function detectors
│   └── export/         @useody/export         — HTML report, JSONL export
├── apps/
│   └── refine/         ody-refine             — CLI application
└── .ody-refine/        (runtime — SQLite DB + reports)
```

Detectors are pure functions: `(nodes, edges, llm?) -> Detection[]`. Build your own:

```typescript
import type { DetectorFn } from '@useody/platform-core';

const detectCustomIssue: DetectorFn = async (nodes, edges, llm) => {
  // Your detection logic
  return [];
};

detectCustomIssue.preFilter = { similarityThreshold: 0.6, topK: 10 };
```

---

## The bigger picture

Ody Refine is the open-source foundation of [Ody](https://useody.com):

| | Ody Refine | Ody Forge | Ody Colleague |
|---|---|---|---|
| **Trust level** | Zero trust | Partial trust | Full product |
| **What it does** | Finds what's broken | Trains your model | AI assistant on your data |
| **Runs** | Locally, free | Managed service | Self-improving |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Quick version:

```bash
git clone https://github.com/rodyr/ody-platform.git
cd ody-platform
pnpm install
pnpm verify
```

---

## License

[Apache 2.0](./LICENSE)

<p align="center">
  <strong>Ody</strong> — Self-Trained Intelligence for Every Team
  <br>
  <a href="https://useody.com">useody.com</a> · Built by <a href="https://github.com/rodyr">Rodyr</a> in Berlin & San Francisco
</p>

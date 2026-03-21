<p align="center">
  <h1 align="center">Ody Refine</h1>
  <p align="center">
    The context integrity layer for company knowledge.<br>
    Find contradictions. Fix them. Train your own AI on the corrections.
  </p>
</p>

<p align="center">
  <a href="https://github.com/ufukkaraca/ody-platform/actions"><img src="https://img.shields.io/github/actions/workflow/status/ufukkaraca/ody-platform/ci.yml?branch=main&style=flat-square" alt="CI"></a>
  <!-- <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/v/ody-refine?style=flat-square&color=blue" alt="npm"></a> -->
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node"></a>
  <a href="https://github.com/ufukkaraca/ody-platform/stargazers"><img src="https://img.shields.io/github/stars/ufukkaraca/ody-platform?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/ufukkaraca/ody-platform/discussions"><img src="https://img.shields.io/badge/discussions-join-blue?style=flat-square&logo=github" alt="Discussions"></a>
</p>

---

**Your docs say one thing. Your wiki says another. Your Slack says a third. Nobody notices until a customer does.**

Ody Refine scans your documentation, finds contradictions, stale claims, and ticking time bombs, then helps you fix them. Every fix becomes training data for a model that actually knows your company.

Runs locally -- your data never leaves your machine. LLM calls are the only external communication.

```bash
export OPENROUTER_API_KEY=sk-or-...    # or use Ollama locally -- no key needed
npx ody-refine ./docs/
open .ody-refine/report.html
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ody refine  ·  47 files  ·  1m 42s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ██████░░░░  62/100 Needs attention

  3 critical  ·  5 warnings  ·  4 info

  ✖ Rate limits: 1,000 req/min in API docs vs 500 in handbook
  ⚠ "Weekly design sync" last mentioned 4 months ago
  ⚠ SLA with Acme Corp expires in 14 days — no renewal doc
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

<!-- TODO: Add screenshot of the HTML consulting report -->

**Requires an LLM** -- either [Ollama](https://ollama.com) running locally (free) or an API key from OpenRouter, OpenAI, Anthropic, etc. No cloud account with *us* -- you bring your own model.

---

## How it works

```
  1. Ingest           2. Detect            3. Resolve           4. Export
  ─────────>         ─────────>           ─────────>           ─────────>

  .md  .pdf          contradictions       interactive TUI      JSONL training data
  Notion             staleness            auto-resolve         Jira/Linear tickets
  Slack              time bombs           suppress/annotate    HTML consulting report
  Confluence         duplicates           consensus voting     CI health badge
  Jira + more        undocumented
```

Every resolved finding becomes a **DPO preference pair** -- training data for fine-tuning your own model. The more you fix, the smarter your AI gets.

---

## Why Ody Refine?

**"Just paste all your docs into Claude"** doesn't scale. Ody Refine does.

| | Paste into LLM | Ody Refine |
|---|---|---|
| **Scale** | ~200k tokens max | Thousands of documents |
| **Reproducible** | One-shot, no history | Diffs, badges, CI integration |
| **Training data** | Nothing saved | Every fix = preference pair |
| **Sources** | Copy-paste | Notion, Slack, Confluence, Jira, files |
| **Privacy** | Your docs on someone's server | Runs on your machine |

---

## What it finds

| Detector | Example |
|----------|---------|
| **Contradictions** | API docs say 1,000 req/min, handbook says 500 |
| **Staleness** | "Weekly sync" last mentioned 4 months ago |
| **Duplicates** | PTO policy in wiki AND handbook, different rules |
| **Time bombs** | SLA expires in 14 days, no renewal doc exists |
| **Undocumented** | "We dropped Python support" -- only in Slack |

Detectors are pure functions: `(nodes, edges, llm?) -> Detection[]`. You can build your own and plug them in.

---

## Connectors

Pull knowledge from where your team actually works:

**Local files** -- Markdown, PDF, plain text &nbsp;&middot;&nbsp; **Notion** -- pages and databases via OAuth &nbsp;&middot;&nbsp; **Slack** -- channels and threads via OAuth &nbsp;&middot;&nbsp; **Confluence** -- spaces and pages via OAuth &nbsp;&middot;&nbsp; **Jira** -- issues and comments via OAuth &nbsp;&middot;&nbsp; **Linear** -- issues and documents via API key &nbsp;&middot;&nbsp; **Gmail** -- emails and threads via OAuth &nbsp;&middot;&nbsp; **Microsoft Teams** -- coming soon

```bash
ody-refine connect notion           # OAuth flow, then scans your workspace
ody-refine connect slack            # Pulls channels you select
ody-refine audit --deep ./docs/     # Combine local + connected sources
```

---

## Quick start

**With npx** (no install):
```bash
OPENROUTER_API_KEY=sk-or-... npx ody-refine ./docs/
```

**Or use Ollama** (free, fully local):
```bash
ollama pull nomic-embed-text && ollama pull qwen2.5:7b
npx ody-refine ./docs/
```

**CI mode:**
```bash
npx ody-refine ci ./docs/ --fail-on critical --min-health 70
```

> Full CLI reference: **[apps/refine/README.md](./apps/refine/README.md)**

---

## GitHub Action

Add a knowledge health check to any repo in two minutes:

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

      - uses: ufukkaraca/ody-platform/.github/actions/refine@main
        id: refine
        with:
          path: './docs'
          fail-on: 'critical'
          min-health: '70'

      - run: echo "Health score is ${{ steps.refine.outputs.score }}/100"
```

<details>
<summary>Action inputs and outputs</summary>

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `path` | `./docs` | Directory to scan |
| `fail-on` | `critical` | Severity that fails the check: `critical`, `warning`, `info`, `none` |
| `min-health` | `70` | Minimum health score (0-100) |
| `fail-on-regression` | `false` | Fail if the score dropped since the last run |
| `provider` | `none` | LLM provider: `ollama`, `anthropic`, `openai`, `none` |
| `model` | | Model name (e.g. `gpt-4o-mini`). Only used when a provider is set. |
| `format` | `markdown` | Report format: `json` or `markdown` |

### Outputs

| Output | Description |
|--------|-------------|
| `score` | Health score from 0 to 100 |
| `findings-count` | Total number of issues found |
| `pass` | `true` or `false` |
| `report-path` | Path to the JSON report file |

</details>

---

## The bigger picture

Refine is the open-source entry point to the **Ody** platform:

```
Refine (find + fix)  -->  Forge (train)  -->  Colleague (deploy)
       |                        |                       |
 contradictions            custom model            AI teammate
 become training      trained on YOUR           that knows YOUR
 data when resolved   corrections               company
       |_______________________________________________|
                   corrections feed back
```

Every resolved contradiction becomes a preference pair. Forge trains a model on those pairs. Colleague deploys that model as an AI assistant. Every correction Colleague receives feeds back into training. **The model gets smarter with every interaction.**

Refine is Apache 2.0 and fully open source. Forge and Colleague are proprietary products built on the same packages.

---

## Monorepo structure

```
ody-platform/
├── apps/
│   └── refine/             CLI application (ody-refine on npm)
├── packages/
│   ├── core/               Types, SQLite store, vector search, LLM providers
│   ├── detectors/          5 pure-function detectors + consensus engine
│   ├── eval/               Benchmarks, corpus runner, scoring
│   ├── export/             HTML consulting report, JSONL, TRL adapter
│   ├── feedback/           Signal collector, reputation, reward derivation
│   └── training/           Dataset registry, model registry, orchestrator
└── examples/               Sample docs, demo scripts, CI workflow
```

| Package | What it does |
|---------|-------------|
| **ody-refine** | CLI -- scan, detect, resolve, export, CI |
| **@useody/platform-core** | Types, SQLite, embedding providers, vector index |
| **@useody/detectors** | Contradiction, staleness, duplicate, time bomb, undocumented detectors |
| **@useody/eval** | Benchmark framework, corpus runner, flywheel metrics |
| **@useody/export** | HTML report generator, JSONL export, TRL DPO format |
| **@useody/feedback** | Correction signals, user reputation, reward derivation |
| **@useody/training** | Dataset registry, training orchestrator, model registry |

---

## Contributing

Contributions are welcome. This project is Apache 2.0 licensed.

```bash
git clone https://github.com/ufukkaraca/ody-platform.git
cd ody-platform
pnpm install
pnpm verify        # lint + typecheck + test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Community

- [GitHub Discussions](https://github.com/ufukkaraca/ody-platform/discussions) -- questions, ideas, show & tell
- [Issues](https://github.com/ufukkaraca/ody-platform/issues) -- bug reports and feature requests

---

## License

[Apache 2.0](./LICENSE)

<p align="center">
  <strong>Ody</strong> &mdash; Self-Trained Intelligence for Every Team
  <br>
  <a href="https://useody.com">useody.com</a>
</p>

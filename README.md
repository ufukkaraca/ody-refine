<p align="center">
  <h1 align="center">Ody</h1>
  <p align="center">
    Find contradictions in your company's knowledge. Fix them. Train a model on the fixes.
  </p>
</p>

<p align="center">
  <a href="https://github.com/ufukkaraca/ody-platform/actions"><img src="https://img.shields.io/github/actions/workflow/status/ufukkaraca/ody-platform/ci.yml?branch=main&style=flat-square" alt="CI"></a>
  <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/v/ody-refine?style=flat-square&color=blue" alt="npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node"></a>
</p>

---

Your docs say one thing. Your wiki says another. Slack says a third.

Ody scans your documentation, finds the contradictions, and gives you a health score. When you fix a finding, it becomes training data for a model that actually knows your company.

Runs locally. Your data stays on your machine.

```bash
npx ody-refine ./docs/
```

```
  ody refine  ·  47 files  ·  1m 42s

  Health: 62/100

  3 contradictions  ·  5 warnings  ·  4 info

  Contradiction  Rate limits: 1,000 req/min in API docs vs 500 in handbook
  Stale          "Weekly design sync" last mentioned 4 months ago
  Time bomb      SLA with Acme Corp expires in 14 days, no renewal doc
```

---

## Install

**npm** (recommended):
```bash
npm install -g ody-refine
```

**Or run without installing:**
```bash
npx ody-refine ./docs/
```

**Individual packages** (if you want to build on top of Ody):
```bash
npm install @useody/platform-core    # Types, interfaces, providers
npm install @useody/detectors        # Detection engine
npm install @useody/export           # JSONL, HTML reports
npm install @useody/feedback         # Correction signals, preference pairs
```

---

## What it detects

| Detector | What it catches |
|----------|----------------|
| **Contradictions** | API docs say 1,000 req/min, handbook says 500 |
| **Staleness** | "Weekly sync" last mentioned 4 months ago |
| **Duplicates** | PTO policy in wiki AND handbook with different rules |
| **Time bombs** | Contract expires in 14 days, no renewal doc |
| **Undocumented** | "We dropped Python support" only exists in Slack, never written down |

Detectors are composable functions: `(nodes, edges, llm?) -> Detection[]`. You can write your own.

---

## Connectors

Pull from where your team works:

| Source | Auth | Status |
|--------|------|--------|
| Local files (Markdown, PDF, text) | none | Stable |
| Notion | OAuth | Stable |
| Slack | OAuth | Stable |
| Confluence | OAuth | Stable |
| Jira | OAuth | Stable |
| Linear | API key | Stable |
| Gmail | OAuth | Stable |
| GitHub | OAuth | Stable |
| Microsoft Teams | OAuth | Stable |

```bash
ody-refine connect notion           # Authenticate, then scan
ody-refine connect slack            # Pick channels to scan
ody-refine scan ./docs/             # Local files
```

---

## LLM support

Ody needs an LLM for detection. Bring your own:

**Local with Ollama** (free, nothing leaves your machine):
```bash
ollama pull nomic-embed-text && ollama pull qwen2.5:7b
ody-refine ./docs/
```

**Cloud via OpenRouter** (any model):
```bash
OPENROUTER_API_KEY=sk-or-... ody-refine ./docs/
```

Also works with OpenAI, Anthropic, or any OpenAI-compatible endpoint.

---

## CI integration

Add a knowledge health check to pull requests:

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
        with:
          path: './docs'
          fail-on: 'critical'
          min-health: '70'
```

CLI mode:
```bash
ody-refine ci ./docs/ --fail-on critical --min-health 70
```

---

## Training data

Every resolved finding becomes a preference pair (DPO format). Export them:

```bash
ody-refine export --format sft -o training-data.jsonl
```

Use the JSONL to fine-tune your own model. The more you fix, the smarter your model gets.

---

## Packages

This is a monorepo. Each package is published independently to npm.

| Package | npm | Purpose |
|---------|-----|---------|
| `ody-refine` | [![npm](https://img.shields.io/npm/v/ody-refine?style=flat-square)](https://www.npmjs.com/package/ody-refine) | CLI tool |
| `@useody/platform-core` | [![npm](https://img.shields.io/npm/v/@useody/platform-core?style=flat-square)](https://www.npmjs.com/package/@useody/platform-core) | Types, SQLite store, LLM/embedding providers |
| `@useody/detectors` | [![npm](https://img.shields.io/npm/v/@useody/detectors?style=flat-square)](https://www.npmjs.com/package/@useody/detectors) | 5 detectors + LLM-augmented layer |
| `@useody/export` | [![npm](https://img.shields.io/npm/v/@useody/export?style=flat-square)](https://www.npmjs.com/package/@useody/export) | HTML reports, JSONL, TRL format |
| `@useody/feedback` | [![npm](https://img.shields.io/npm/v/@useody/feedback?style=flat-square)](https://www.npmjs.com/package/@useody/feedback) | Correction signals, reputation, reward derivation |
| `@useody/training` | internal | Dataset registry, training orchestrator |
| `@useody/eval` | internal | Benchmarks, corpus runner |

```
ody-platform/
  apps/refine/       CLI (ody-refine)
  packages/
    core/            Types, store, providers
    detectors/       Detection engine
    eval/            Benchmarks
    export/          Reports, JSONL
    feedback/        Signals, rewards
    training/        Training orchestrator
  examples/          Sample docs, demo scripts
```

---

## Contributing

```bash
git clone https://github.com/ufukkaraca/ody-platform.git
cd ody-platform
pnpm install
pnpm verify   # lint + typecheck + test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, adding detectors, and PR process.

---

## License

[Apache 2.0](./LICENSE)

<p align="center">
  <strong>Ody</strong> -- built by <a href="https://useody.com">Rodyr</a>
</p>

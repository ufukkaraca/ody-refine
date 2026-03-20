<p align="center">
  <h1 align="center">ody-refine</h1>
  <p align="center">
    Find contradictions, staleness, and drift in your docs &mdash; before your team does.
  </p>
</p>

<p align="center">
  <!-- <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/v/ody-refine?style=flat-square&color=blue" alt="npm"></a> -->
  <!-- <a href="https://www.npmjs.com/package/ody-refine"><img src="https://img.shields.io/npm/dm/ody-refine?style=flat-square" alt="npm downloads"></a> -->
  <a href="https://github.com/ufukkaraca/ody-refine/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node"></a>
  <a href="https://github.com/ufukkaraca/ody-refine/stargazers"><img src="https://img.shields.io/github/stars/ufukkaraca/ody-refine?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/ufukkaraca/ody-refine/discussions"><img src="https://img.shields.io/badge/discussions-join-blue?style=flat-square&logo=github" alt="Discussions"></a>
</p>

---

**Your docs say one thing. Your wiki says another. Your Slack says a third. Nobody notices until a customer does.**

Ody Refine scans your documentation, finds contradictions, stale claims, and ticking time bombs, then helps you fix them. Runs locally -- your data never leaves your machine. LLM calls are the only external communication.

## Quickstart

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

Every resolved finding becomes a DPO preference pair -- training data for fine-tuning your own model. The more you fix, the smarter your AI gets.

## Why Ody Refine?

**"Just paste all your docs into Claude"** doesn't scale. Ody Refine does.

- **Scales beyond context windows** -- handles thousands of documents, not just what fits in 200k tokens
- **Runs in CI** -- block PRs when documentation health drops below your threshold
- **Produces training data** -- every fix becomes a preference pair for fine-tuning your own model
- **Runs locally** -- your docs, your machine, your data. No cloud account with us.
- **Multi-source** -- pull from Slack, Notion, Confluence, Jira, and more in a single audit

## What it finds

| Detector | Example |
|----------|---------|
| **Contradictions** | API docs say 1,000 req/min, handbook says 500 |
| **Staleness** | "Weekly sync" last mentioned 4 months ago |
| **Duplicates** | PTO policy in wiki AND handbook, different rules |
| **Time bombs** | SLA expires in 14 days, no renewal doc exists |
| **Undocumented** | "We dropped Python support" -- only in Slack |

## Connectors

Pull knowledge from where your team actually works:

- **Local files** -- Markdown, PDF, plain text, any directory
- **Notion** -- pages and databases via OAuth
- **Slack** -- channels and threads via OAuth
- **Confluence** -- spaces and pages via OAuth
- **Jira** -- issues and comments via OAuth
- **Linear** -- issues, projects, and documents via API key
- **Gmail** -- emails and threads via OAuth
- **Microsoft Teams** -- coming soon

```bash
ody-refine connect notion           # OAuth flow, then scans your workspace
ody-refine connect slack            # Pulls channels you select
ody-refine audit --deep ./docs/     # Combine local + connected sources
```

## Install

**With npx** (no install):
```bash
npx ody-refine ./docs/
```

**Global install:**
```bash
npm install -g ody-refine
ody-refine ./docs/
```

**From source:**
```bash
git clone https://github.com/ufukkaraca/ody-refine.git
cd ody-refine && pnpm install && pnpm build
node apps/refine/dist/cli.js ./docs/
```

### LLM providers

Bring your own model. Set one of these environment variables:

| Provider | Env var | Notes |
|----------|---------|-------|
| [OpenRouter](https://openrouter.ai) | `OPENROUTER_API_KEY` | Access to 100+ models. Recommended starting point. |
| [Ollama](https://ollama.com) | *(none needed)* | Free, fully local. `ollama pull qwen2.5:7b` |
| [OpenAI](https://platform.openai.com) | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini |
| [Anthropic](https://console.anthropic.com) | `ANTHROPIC_API_KEY` | Claude models |
| [Groq](https://console.groq.com) | `GROQ_API_KEY` | Fast inference |
| [Google Gemini](https://aistudio.google.com) | `GEMINI_API_KEY` | Gemini models |
| [xAI](https://console.x.ai) | `XAI_API_KEY` | Grok models |

## Commands

| Command | What it does |
|---------|-------------|
| `ody-refine <dir>` | Scan a directory -- ingest, detect, and generate a health report |
| `ody-refine resolve` | Interactive TUI to triage findings: accept, reject, suppress |
| `ody-refine export` | Export as JSONL training data, Jira/Linear tickets, or CSV |
| `ody-refine ci` | CI mode -- exit non-zero if health drops below threshold |
| `ody-refine audit --deep` | Deep audit combining multiple sources into one analysis |
| `ody-refine connect <source>` | Connect to Notion, Slack, Confluence, Jira, Linear, Gmail |

<details>
<summary>All commands</summary>

| Command | Description |
|---------|-------------|
| `ingest <dir>` | Ingest markdown, PDF, or text files from a directory |
| `detect` | Re-run detectors on previously ingested data |
| `report` | Generate or regenerate the HTML health report |
| `scan <url>` | Crawl and scan public docs from a URL |
| `diff` | Compare current scan against a previous one |
| `badge` | Generate an SVG health badge for your README |
| `status` | Show knowledge graph stats |
| `config` | Display or edit configuration |
| `optimize` | Auto-tune detector thresholds based on your feedback |
| `telemetry [on\|off\|status]` | Manage opt-in anonymous telemetry |

</details>

## CI/CD

```yaml
# .github/workflows/docs-health.yml
name: Knowledge Health
on:
  pull_request:
    paths: ['docs/**', '*.md']

jobs:
  refine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx ody-refine ci --dir ./docs --min-health 70 --fail-on critical
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

```bash
# Generate a health badge for your README
ody-refine badge -o docs/health-badge.svg
```

## Configuration

Create `~/.config/ody-refine/config.toml`:

```toml
[embedding]
provider = "transformers"   # or "ollama", "openai", "cohere"

[llm]
provider = "ollama"         # or "openrouter", "openai", "anthropic"
model = "qwen2.5:7b"
```

Suppress false positives with `.ody-refine-ignore`:

```
type:time_bomb
text:rate limit
```

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

Refine is Apache 2.0. Forge and Colleague are proprietary products built on the same packages.

## System Requirements

- **Node.js** 20 or later (required for `crypto.randomUUID`)
- **pnpm** (recommended) or npm
- **macOS**, **Linux**, or **Windows** (via WSL)
- **Git** (for GitHub repository connector)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `crypto.randomUUID is not a function` | Upgrade to Node.js 20+ |
| `OPENROUTER_API_KEY not set` | Export the key: `export OPENROUTER_API_KEY=sk-or-...` |
| No documents found after scan | Check connector config -- verify file paths or repo access |
| Permission error on npx | Try `npx --yes ody-refine` |
| Wrong model selected | Use `--model` flag: `ody-refine detect --model anthropic/claude-3-haiku` |
| Network/timeout errors | Verify API key and internet connection |

## Community

- [GitHub Discussions](https://github.com/ufukkaraca/ody-refine/discussions) -- questions, ideas, show & tell
- [Issues](https://github.com/ufukkaraca/ody-refine/issues) -- bug reports and feature requests
- [Contributing Guide](https://github.com/ufukkaraca/ody-refine/blob/main/CONTRIBUTING.md) -- PRs welcome

## License

[Apache 2.0](https://github.com/ufukkaraca/ody-refine/blob/main/LICENSE)

<p align="center">
  <strong>Ody</strong> &mdash; Self-Trained Intelligence for Every Team
  <br>
  <a href="https://useody.com">useody.com</a>
</p>

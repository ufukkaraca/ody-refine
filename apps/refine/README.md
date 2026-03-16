# ody-refine

Find contradictions, staleness, and drift in your documentation — locally, in seconds.

## Install

```bash
npm install -g ody-refine
```

Or run without installing:

```bash
npx ody-refine ./docs/
```

## Quick Start

```bash
# Scan a directory (zero config, no API key needed)
ody-refine ./docs/

# Fast heuristic mode (no LLM, instant)
ody-refine ingest ./docs/ --no-llm

# Generate HTML report
ody-refine report

# Export findings as JSONL
ody-refine export -o findings.jsonl

# CI mode with score threshold
ody-refine ci --min-health 80
```

## Commands

| Command | Description |
|---------|-------------|
| `ingest <dir>` | Scan a directory of markdown/PDF files |
| `detect` | Re-run detectors on existing data |
| `resolve` | Interactive TUI to triage findings |
| `export` | Export as JSONL, tickets, or training data |
| `report` | Generate HTML health report |
| `ci` | CI/CD integration with thresholds |
| `scan <url>` | Crawl and scan public docs |
| `diff` | Compare current vs previous scan |
| `badge` | Generate SVG health badge |
| `status` | Show knowledge graph stats |
| `config` | Display current configuration |
| `optimize` | Auto-tune detector thresholds |

## Configuration

Create `~/.config/ody-refine/config.toml`:

```toml
[embedding]
provider = "transformers"   # or "ollama", "openai", "cohere"

[llm]
provider = "openrouter"     # or "ollama", "mlx"
model = "google/gemini-2.0-flash-lite-001"
```

Or use environment variables:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
export OPENAI_API_KEY=sk-...
```

## Suppressing False Positives

Create `.ody-refine-ignore` in your project root:

```
# Ignore all time bomb detections
type:time_bomb

# Ignore specific text patterns
text:rate limit

# Ignore by detection type and text
type:contradiction text:deprecated
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

Apache 2.0 — see [LICENSE](../../LICENSE).

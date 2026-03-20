# Changelog

All notable changes to Ody Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-16

### Added

- **Ody Refine CLI** (`ody-refine`) — scan your docs for knowledge integrity issues
  - `ingest` — scan a directory of markdown/PDF files
  - `detect` — run 5 detectors (contradictions, duplicates, staleness, undocumented, time-bombs)
  - `resolve` — interactive TUI to triage findings
  - `export` — export findings as JSONL, tickets, or TRL training data
  - `report` — generate an HTML health report
  - `ci` — CI/CD integration with score thresholds and regression detection
  - `scan` — crawl and scan public documentation URLs
  - `diff` — compare current vs previous scan results
  - `badge` — generate an SVG health badge for your README
  - `status` — show knowledge graph statistics
  - `config` — display current configuration
  - `optimize` — auto-tune detector thresholds (experimental)
- **@useody/platform-core** — types, interfaces, SQLite storage, vector search
  - KnowledgeNode, KnowledgeEdge, Detection types
  - SQLite repositories with sqlite-vec cosine similarity
  - LLMProvider and EmbeddingProvider interfaces
  - Provider cascade: Ollama, transformers.js, OpenRouter, Cohere, OpenAI
- **@useody/detectors** — 5 built-in conflict detectors (pure functions)
  - Contradiction detector with heuristic + LLM claim comparison
  - Duplicate detector with embedding similarity
  - Staleness detector with date extraction and supersession
  - Undocumented topic detector
  - Time-bomb detector with deadline parsing
- **@useody/export** — output adapters
  - HTML report with executive summary, health score, grouped findings
  - JSONL export for downstream processing
  - Ticket generation (markdown + JSON)
  - TRL-compatible DPO/SFT training data export
- **Ody Forge CLI** (`ody-forge`) — model training pipeline (separate proprietary repo)
  - `dataset create/list/inspect` — manage training datasets
  - `train start/auto` — SFT training with eval gating
  - `eval generate-benchmark/run` — benchmark generation and evaluation
- **@useody/training** — training orchestration with replay buffer
- **@useody/eval** — benchmark generation and model evaluation
- **@useody/feedback** — interaction signal collection and reward derivation
- **Source adapters** — Notion export, Confluence HTML export, web crawler
- **GitHub Action** — `ody-refine ci` for PR-level knowledge health checks
- **.ody-refine-ignore** — suppress false positives with pattern rules

### Technical

- Zero-config embedding via `@huggingface/transformers` (no API key needed)
- SQLite + sqlite-vec for local vector storage with cosine distance
- LLM cascade: OpenRouter > MLX (Apple Silicon) > Ollama
- Edge reasoning during ingest creates typed relationships
- LLM validation loop filters false positives
- Incremental ingestion with file hash tracking

[0.1.0]: https://github.com/ufukkaraca/ody-platform/releases/tag/v0.1.0

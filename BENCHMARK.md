# Contradiction Detection Benchmark

This document describes how we measure the accuracy of Ody's contradiction
detection pipeline. It is written for reviewers who want to understand exactly
what we test, how we test it, and where the gaps are.

## What We Measure

We measure the ability to detect **contradictions** between pairs of enterprise
documents — cases where two documents make incompatible claims about the same
thing.

A contradiction requires both documents to make **active, explicit, incompatible
claims** about the **same specific subject**. Examples:

- Document A says uptime SLA is 99.99%; Document B says 99.9%
- Policy A says remote-first, no mandatory office days; Policy B requires 3
  days in-office per week
- Sales deck claims HIPAA compliance; internal tracker shows certification
  pending

What does **not** count as a contradiction:

- Different numbers for different time periods (team was 10 in 2023, 20 in 2024)
- Different policies for different departments (eng remote, sales in-office)
- Different configs for different environments (staging vs production)
- A draft RFC proposing changes vs current production documentation
- Different pricing tiers having different limits

These non-contradictions are critical to measure. A detector that flags every
difference as a contradiction is useless. Our corpus includes 26 hard negative
pairs specifically designed to test this.

## Corpus

**101 document pairs** across 6 categories:

| Category | Count | Has Contradiction | Description |
|----------|-------|-------------------|-------------|
| Numerical | 15 | Yes | Conflicting numbers: revenue, headcount, SLAs, budgets, rate limits |
| Temporal | 15 | Yes | Conflicting dates/deadlines: launch dates, deprecation timelines, policy effective dates |
| Policy | 15 | Yes | Conflicting rules: remote work, deployment, access control, approval processes |
| Implicit | 15 | Yes | Stated values contradicted by operational reality: "flat hierarchy" + 8-level ladder |
| Scope | 15 | Yes | Feature/capability claims that don't match implementation: "available" vs "not built yet" |
| Hard Negative | 26 | No | Pairs that look similar but aren't contradictions: different time periods, departments, tiers |

**Total: 75 positive pairs, 26 negative pairs.**

### How the corpus was created

Every pair was hand-crafted to simulate contradictions that occur in real
enterprise knowledge bases. The documents are synthetic but modeled on patterns
we've seen in Confluence, Notion, Google Docs, and internal wikis.

We did not scrape or collect real enterprise data. Each pair was written by a
human, reviewed for correctness, and annotated with:

- Category
- Whether a contradiction exists
- Expected finding description (for positives)
- Minimum expected severity

**This is not an independent academic dataset.** It is a curated evaluation
corpus maintained alongside the code. We acknowledge this limits the claims we
can make — see [Limitations](#limitations).

### Category examples

**Numerical** — Q4 revenue reported as $4.2M in the quarterly report but $3.8M
in the investor update. Both claim to state the same quarter's actual revenue.

**Temporal** — Product roadmap says V2 launches Q2 2026; board update says Q4
2026. Same product, same milestone, incompatible dates.

**Policy** — Remote work policy says "remote-first, no mandatory office days";
office attendance guidelines require 3 days per week in-office.

**Implicit** — Company culture page says "fully remote" but onboarding schedule
requires in-office presence for the first two weeks. The contradiction is between
a stated principle and an operational process that violates it.

**Scope** — Pricing page lists SSO in the Pro tier; product spec says SSO is
Enterprise-only. Same feature, incompatible availability claims.

**Hard Negative** — Engineering team has a remote-first policy; sales team
requires office presence. Different policies for different departments — not a
contradiction.

## Detection Pipeline

We benchmark three approaches to understand where value comes from:

### Approach A: Heuristic Only (`current-pipeline`)

Runs five rule-based detectors on the document pairs without any LLM
involvement:

1. **Contradiction detector** — entity extraction, fact comparison, embedding
   similarity
2. **Duplicate detector** — near-duplicate content across sources
3. **Staleness detector** — outdated information based on temporal signals
4. **Undocumented detector** — referenced entities with no backing documentation
5. **Time bomb detector** — dates/deadlines that have passed or are approaching

For this benchmark, only contradiction-type detections are scored.

**Strengths:** Fast, deterministic, zero API cost.
**Weaknesses:** Cannot reason about implicit contradictions or nuanced scope
conflicts.

### Approach B: Raw LLM (`raw-llm`)

Sends document pairs to an LLM through the same detection pipeline with the LLM
provider enabled. The model sees the full documents and is asked to identify
contradictions.

**Strengths:** Can catch implicit and scope contradictions that heuristics miss.
**Weaknesses:** Expensive, slow, results vary by model, can hallucinate
contradictions.

### Approach C: LLM-Augmented (`llm-augmented`)

This is what ships in the Refine CLI. It combines both approaches:

1. Run the heuristic pipeline first (Approach A)
2. Build "context packages" — entity-grouped document bundles
3. Send context packages to the LLM with a structured chain-of-thought prompt
4. LLM verifies heuristic findings and catches contradictions heuristics missed
5. Merge results, deduplicate, adjust severity based on source authority

The LLM receives a system prompt that enforces step-by-step reasoning:
identify shared entities → extract claims per document → compare for
incompatibility → output structured findings.

**Strengths:** Heuristic pre-filter reduces LLM calls and hallucinations; LLM
catches what heuristics miss.
**Weaknesses:** Still model-dependent; slower than heuristics alone.

### Gate Criteria

The benchmark evaluates a pass/fail gate for each model:

1. **C.precision ≥ B.precision** — augmented pipeline must be at least as
   precise as raw LLM
2. **C.recall ≥ A.recall** — augmented pipeline must catch at least as much as
   heuristics alone
3. **C.F1 > max(A.F1, B.F1)** — augmented pipeline must beat both individual
   approaches

This gate tests the core hypothesis: combining heuristics and LLM should be
better than either alone.

## How to Reproduce

```bash
# Clone and build
git clone https://github.com/ufukkaraca/ody-refine
cd ody-refine
pnpm install && pnpm build

# Run with a single model (requires OPENROUTER_API_KEY)
export OPENROUTER_API_KEY=sk-or-v1-...
pnpm run benchmark --models=ollama/llama3

# Run with multiple models
pnpm run benchmark --models=ollama/llama3,anthropic/claude-3-haiku,openai/gpt-4o

# Or use environment variable
BENCHMARK_MODELS=anthropic/claude-3-haiku pnpm run benchmark
```

The script runs all three approaches for each model and produces:

- A markdown comparison table printed to stdout
- A timestamped `.md` report file
- A timestamped `.json` file with full results (for programmatic analysis)

Intermediate results are saved after each model completes, so a crash on model 3
doesn't lose results from models 1 and 2.

### Default models

If no `--models` flag or `BENCHMARK_MODELS` env var is set, the benchmark runs
against:

```
ollama/llama3
anthropic/claude-3-haiku
anthropic/claude-3.5-sonnet
anthropic/claude-opus-4-6
openai/gpt-4o
```

All models are accessed through OpenRouter. You can use any model ID that
OpenRouter supports, including local models via `ollama/`.

## Results

### Run: 2026-03-23

Corpus: 202 nodes, 101 pairs (75 positive, 26 negative).
All models accessed via OpenRouter. Temperature 0.

| Model | Approach | Precision | Recall | F1 | Duration |
|-------|----------|-----------|--------|----|----------|
| anthropic/claude-3-haiku | current-pipeline | 18.0% | 12.0% | 14.4% | 326ms |
| anthropic/claude-3-haiku | raw-llm | 31.5% | 30.7% | 31.1% | 2m 54s |
| anthropic/claude-3-haiku | llm-augmented | 32.4% | 32.0% | 32.2% | 37s |
| anthropic/claude-3.5-sonnet | current-pipeline | 18.0% | 12.0% | 14.4% | 298ms |
| anthropic/claude-3.5-sonnet | raw-llm | 37.7% | 34.7% | 36.1% | 7m 56s |
| anthropic/claude-3.5-sonnet | llm-augmented | 36.4% | 32.0% | 34.0% | 1m 44s |

### Summary (Best F1 per Model)

| Model | Best F1 | Best Approach | Gate |
|-------|---------|---------------|------|
| anthropic/claude-3-haiku | 32.2% | llm-augmented | PASS |
| anthropic/claude-3.5-sonnet | 36.1% | raw-llm | FAIL |

### Observations

- **Heuristic-only baseline** (current-pipeline) is consistent across models
  (14.4% F1) since it uses no LLM. Fast (<330ms) but low recall.
- **Claude 3 Haiku** passes the gate: the LLM-augmented approach (32.2% F1)
  beats both heuristic-only and raw-LLM, validating the hybrid design.
- **Claude 3.5 Sonnet** fails the gate: raw-LLM (36.1% F1) outperforms
  LLM-augmented (34.0% F1). The stronger model's raw reasoning outperforms
  the structured pipeline, suggesting the augmented prompts may constrain
  larger models.
- **Cost vs accuracy tradeoff:** Haiku is ~20x cheaper than Sonnet and runs
  ~5x faster for the LLM-augmented approach, while the augmented pipeline
  delivers comparable precision (32.4% vs 36.4%).
- These results are from a single run. LLM outputs can vary — re-run the
  benchmark to verify.

Results vary by model, model version, and even time of day (for hosted models
with varying load). **Run the benchmark yourself to verify.**

Expected output format:

| Model | Approach | Precision | Recall | F1 | Duration |
|-------|----------|-----------|--------|----|----------|
| model-id | current-pipeline | —% | —% | —% | —s |
| model-id | raw-llm | —% | —% | —% | —s |
| model-id | llm-augmented | —% | —% | —% | —s |

## Model Sensitivity

Detection accuracy is **highly model-dependent**. The same pipeline code with
different LLM backends produces dramatically different results. Factors include:

- **Model size:** Larger models generally catch more implicit and scope
  contradictions
- **Instruction following:** Models that reliably output structured JSON produce
  fewer parse failures
- **Reasoning depth:** Chain-of-thought quality varies significantly across
  model families
- **Temperature:** The benchmark runs at temperature 0 for reproducibility, but
  some models show variance even at temperature 0

We do not endorse a specific model. The benchmark exists so you can evaluate
which model works for your use case and budget.

## Related Work and External Benchmarks

### Where this sits in the NLI landscape

Standard NLI benchmarks (SNLI, MultiNLI, ANLI) operate at **sentence level**:
given a premise and hypothesis, classify as entailment, neutral, or
contradiction. Our task is fundamentally different: **document-level
contradiction detection across enterprise knowledge bases**. Documents are
longer, contradictions are often implicit or scattered across paragraphs, and
the distinction between "real contradiction" and "legitimate difference"
(different departments, time periods, tiers) is critical. Sentence-level NLI
scores do not transfer to this problem.

### ContractNLI (Koreeda & Manning, EMNLP 2021)

The closest established benchmark to our use case.

- **Corpus:** 607 non-disclosure agreements annotated against 17 hypothesis
  templates, producing ~10,319 document-hypothesis pairs
- **Labels:** Entailment, Contradiction, NotMentioned (three-way, not binary)
- **License:** CC BY 4.0
- **HuggingFace:** `load_dataset("kiddothe2b/contract-nli")` (~20K rows, Parquet)
- **GitHub:** github.com/stanfordnlp/contract-nli

ContractNLI is relevant because it has explicit contradiction labels at the
document level. Key differences: ContractNLI tests a document against a fixed
hypothesis template (not document-vs-document), and covers legal text rather
than enterprise operational documents.

**We plan to add ContractNLI as an external validation dataset.** Results will
be published here when available.

### DocNLI (Yin et al., ACL 2021, Salesforce)

- **Corpus:** 1.44M document-level NLI examples
- **Labels:** Binary only — entailment vs not_entailment (merges neutral and
  contradiction into a single negative class)
- **HuggingFace:** `load_dataset("tasksource/doc-nli")` or `saattrupdan/doc-nli`
- **License:** BSD-3-Clause

Less relevant for our purposes because binary labels cannot isolate
contradictions from neutral pairs — a model learns "related or unrelated"
rather than "these documents contradict each other."

### arXiv 2504.00180 — Contradiction Detection in RAG Systems

The most directly comparable published work.

- **Corpus:** 1,867 synthetic samples derived from HotpotQA
- **Contradiction types:** self-contradictions, pair contradictions, conditional
  contradictions
- **Dataset:** Not publicly available. Results can be cited but not reproduced.

Published results:

| Model | Basic F1 | CoT F1 |
|-------|----------|--------|
| Claude-3 Sonnet | 0.446 | **0.710** |
| Claude-3 Haiku | 0.069 | 0.505 |
| Llama-3.3 70B | 0.676 | 0.331 |
| Llama-3.1 8B | 0.020 | 0.421 |

Best result: Claude Sonnet + CoT → P=0.951, R=0.566, F1=0.710.

**This is not a direct comparison.** Key differences:

| | arXiv 2504.00180 | This benchmark |
|---|---|---|
| Corpus size | 1,867 pairs | 101 pairs |
| Corpus source | Synthetic RAG pairs (HotpotQA) | Hand-crafted enterprise docs |
| Task framing | RAG contradiction detection | Enterprise knowledge base audit |
| Approach | LLM-only | Heuristic + LLM hybrid |
| Hard negatives | Included (count unspecified) | 26 (25.7% of corpus) |
| Dataset public | No | Yes |

Notable finding from the paper: chain-of-thought prompting dramatically
improves some models (Claude Sonnet: 0.446 → 0.710) but hurts others
(Llama-3.3 70B: 0.676 → 0.331). Our LLM-augmented pipeline uses structured
CoT, so model selection matters.

### Planned external evaluations

1. **ContractNLI** — run our pipeline against the CC BY 4.0 dataset and report
   precision/recall/F1 on the contradiction subset
2. **Expanded corpus** — grow from 101 to 500+ pairs with community contributions
3. **Cross-domain** — test on legal (ContractNLI), scientific, and multilingual
   document pairs

## Limitations

We want to be explicit about what this benchmark does and does not prove:

1. **Curated corpus, not independently sourced.** The same team that built the
   detectors also wrote the test pairs. This introduces potential bias — we may
   unconsciously write pairs that our detectors handle well. Mitigation: the
   corpus is public, and we welcome external contributions.

2. **Small corpus.** 101 pairs is enough to catch regressions and compare
   approaches, but not enough for statistical significance claims. Confidence
   intervals on F1 with n=101 are wide.

3. **English only.** All documents are English-language enterprise content. We
   have not tested multilingual detection.

4. **Synthetic documents.** While modeled on real enterprise patterns, the
   documents are not sourced from actual companies. Real-world documents may
   be longer, noisier, and have more ambiguous contradictions.

5. **Hard negatives may not cover all edge cases.** Our 26 hard negatives test
   common false-positive patterns (temporal evolution, department scope,
   environment differences), but there are likely patterns we haven't
   anticipated.

6. **Model and version dependency.** LLM results are tied to specific model
   versions. A model update can change results. We recommend re-running the
   benchmark periodically and after model updates.

7. **No external baseline yet.** We have not yet run against ContractNLI or
   other established NLI datasets. ContractNLI evaluation (CC BY 4.0) is
   planned — see [Planned external evaluations](#planned-external-evaluations).

8. **Single-language, single-domain.** Enterprise English documents. We make no
   claims about legal, medical, scientific, or multilingual contradiction
   detection.

## Contributing

### Adding pairs to the corpus

The corpus lives in `packages/eval/fixtures/contradiction-corpus/`. To add
pairs:

1. Add document nodes to `nodes.json` with a shared `pairId`
2. Add the ground truth entry to `ground-truth.json` with:
   - `category`: one of `numerical`, `temporal`, `policy`, `implicit`, `scope`,
     `hard_negative`
   - `hasContradiction`: `true` or `false`
   - `expectedFinding`: description of the expected contradiction (or `null` for
     hard negatives)
3. Run `pnpm build && pnpm test` to verify the corpus loads correctly

Guidelines for new pairs:

- Each pair should test one specific contradiction pattern
- Hard negatives should be genuinely tricky — things that look contradictory but
  aren't
- Include realistic enterprise context (department names, dates, specifics)
- Avoid trivially obvious contradictions ("X is true" / "X is false")

### Running with different models

```bash
# Any OpenRouter-supported model
pnpm run benchmark --models=meta-llama/llama-3-70b-instruct

# Local models via Ollama (must be running)
pnpm run benchmark --models=ollama/mistral

# Multiple models in one run
pnpm run benchmark --models=ollama/llama3,anthropic/claude-3-haiku
```

### Interpreting results

- **Precision** = what fraction of flagged contradictions are real
- **Recall** = what fraction of real contradictions were found
- **F1** = harmonic mean of precision and recall
- **Gate PASS** = the LLM-augmented approach outperforms both heuristics-only
  and raw-LLM on the combined metric

A model that passes the gate validates the hybrid approach: heuristic pre-filter
plus LLM verification is better than either alone.

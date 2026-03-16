# Autoresearch Integration — How Self-Improving Detection Works

## The Karpathy Pattern

Karpathy's autoresearch: one modifiable file (train.py), one fixed metric (val_bpb), one fixed time budget (5 min). The agent proposes changes → runs experiment → keeps improvements → reverts failures. 100 experiments overnight.

## How This Maps to Ody

| Autoresearch | Ody Equivalent |
|-------------|---------------|
| `train.py` (modifiable) | Detector thresholds, LLM prompts, pre-filter params |
| `val_bpb` (metric) | Precision + Recall against labeled ground truth |
| 5-min budget | One scan of the test corpus (~1-13 seconds) |
| 100 experiments | 100 threshold/prompt variations overnight |

## The Ody Autoresearch Loop

```
┌─────────────────────────────────────────┐
│ 1. Load ground truth (labeled findings) │
│    examples/sample-ground-truth.json    │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ 2. Run Refine on test corpus            │
│    Current config → detections          │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ 3. Score against ground truth           │
│    precision, recall, F1                │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ 4. LLM proposes config changes          │
│    "Try lowering topK from 10 to 5"    │
│    "Try raising similarity to 0.8"      │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ 5. Apply changes → re-run → re-score   │
│    Keep if F1 improved, revert if not   │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ 6. Repeat for N iterations              │
│    Wake up to better detectors          │
└─────────────────────────────────────────┘
```

## What's Already Built

- `apps/refine/src/autoresearch/optimize.ts` — the main loop
- `apps/refine/src/autoresearch/ground-truth.ts` — scoring function
- `apps/refine/src/autoresearch/config-space.ts` — what can be tuned
- `apps/refine/src/autoresearch/proposer.ts` — LLM-based config proposer
- `examples/sample-ground-truth.json` — labeled test data
- `examples/pi-ground-truth.json` — PI labeled data
- CLI command: `ody-refine optimize --corpus ./docs/ --ground-truth ./gt.json`

## Three Applications

### 1. Detector Threshold Optimization (Today)
Tune: similarityThreshold, topK, maxLlmCalls, minSharedWords
Metric: F1 against labeled ground truth
Result: Better precision without losing recall

### 2. LLM Prompt Optimization (Next)
Tune: the system prompts for claim comparison, validation, fact extraction
Metric: Validation accuracy (does it correctly identify real vs false positive?)
Result: Better LLM-powered detection quality

### 3. Self-Healing Documentation (Future)
Tune: the documentation itself
Metric: health score (after auto-fix, does the score improve?)
Result: Ody proposes PRs to fix contradictions

## Connection to Forge

The autoresearch loop produces the same kind of data that Forge consumes:
- Each "keep" decision is a preference pair: (better config, worse config)
- Accumulated optimization data trains a meta-model: "what detector configs work best for what corpus types?"
- This meta-model becomes a Forge product: "smart defaults" per industry/corpus type

## Connection to the Nyk Article (348K views)

The article describes Claude + Obsidian as a three-layer memory stack. The key quote:
> "The agent notices when two notes contradict each other and flags the tension."

Ody IS this, but automated and productized. The autoresearch loop is what makes it COMPOUND:
- Each run improves detection quality
- Each resolved contradiction becomes training data
- Each training run produces a better model
- Each model interaction generates feedback signals
- The flywheel accelerates over time

## Running Autoresearch Tonight

```bash
# From repo root:
OPENROUTER_API_KEY="..." node apps/refine/dist/cli.js optimize \
  --corpus examples/sample-docs/ \
  --ground-truth examples/sample-ground-truth.json \
  --iterations 20
```

This runs 20 experiments, each modifying detector thresholds and measuring F1. The best config is saved for next session.

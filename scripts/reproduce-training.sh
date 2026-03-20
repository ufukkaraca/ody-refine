#!/usr/bin/env bash
# reproduce-training.sh — ODY-140: Reproducible SFT training proof
#
# Runs SFT training on Modal GPU and evaluates on ALL 20 eval questions.
# Supports multiple runs with different seeds to average results.
#
# Prerequisites:
#   - Modal account with GPU access (modal setup)
#   - Python 3.11+
#   - modal-client pip package
#
# Usage:
#   ./scripts/reproduce-training.sh                    # single run
#   ./scripts/reproduce-training.sh --runs 3           # average over 3 runs
#   ./scripts/reproduce-training.sh --base-model X     # use different model
#
# The script:
#   1. Reads sft-pairs.jsonl (125 training pairs)
#   2. Reads eval-questions.jsonl (20 eval questions)
#   3. Sends both to Modal T4 GPU
#   4. Trains SFT with LoRA (3 epochs, lr=2e-5, r=16)
#   5. Evaluates base model on all 20 questions
#   6. Evaluates fine-tuned model on all 20 questions
#   7. Scores by key_facts presence (correct if >= half of facts found)
#   8. Reports results as a table

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"
DATASET="$PLATFORM_DIR/eval/fixtures/acme-training/sft-pairs.jsonl"
EVAL_QUESTIONS="$PLATFORM_DIR/eval/fixtures/acme-training/eval-questions.jsonl"

RUNS=1
BASE_MODEL="Qwen/Qwen2.5-3B"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs) RUNS="$2"; shift 2 ;;
    --base-model) BASE_MODEL="$2"; shift 2 ;;
    -h|--help)
      head -25 "$0" | tail -17
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Validate inputs
[ -f "$DATASET" ] || { echo "ERROR: Missing dataset: $DATASET"; exit 1; }
[ -f "$EVAL_QUESTIONS" ] || { echo "ERROR: Missing eval: $EVAL_QUESTIONS"; exit 1; }
command -v modal >/dev/null || { echo "ERROR: modal CLI not found. Run: pip install modal"; exit 1; }

NUM_PAIRS=$(wc -l < "$DATASET" | tr -d ' ')
NUM_QUESTIONS=$(grep -c '{' "$EVAL_QUESTIONS" || true)

echo "╔══════════════════════════════════════════════════╗"
echo "║  ODY-140: Reproducible SFT Training Proof       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Base model:     $BASE_MODEL"
echo "  Dataset:        $NUM_PAIRS training pairs"
echo "  Eval questions: $NUM_QUESTIONS questions (full set)"
echo "  Runs:           $RUNS"
echo "  Method:         SFT + LoRA (r=16, alpha=32, 3 epochs)"
echo ""

RESULTS_DIR="$(mktemp -d)"
export RESULTS_DIR RUNS
trap 'rm -rf "$RESULTS_DIR"' EXIT

for i in $(seq 1 "$RUNS"); do
  SEED=$((42 + i - 1))
  echo "━━━ Run $i/$RUNS (seed=$SEED) ━━━"
  echo ""

  modal run "$SCRIPT_DIR/modal-reproduce.py" \
    --seed "$SEED" \
    --base-model "$BASE_MODEL" \
    --dataset "$DATASET" \
    --eval-questions "$EVAL_QUESTIONS" \
    2>&1 | tee "$RESULTS_DIR/run-$i.log"

  # Extract the RESULT: JSON line from Modal output
  grep '^RESULT:' "$RESULTS_DIR/run-$i.log" \
    | sed 's/^RESULT://' > "$RESULTS_DIR/run-$i.json" || true

  if [ ! -s "$RESULTS_DIR/run-$i.json" ]; then
    echo "WARNING: No result extracted from run $i"
  fi
  echo ""
done

# Aggregate and display results
echo "╔══════════════════════════════════════════════════╗"
echo "║  Results                                        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

python3 << 'PYEOF'
import json, os, sys

results_dir = os.environ.get("RESULTS_DIR", "")
if not results_dir:
    results_dir = sys.argv[1] if len(sys.argv) > 1 else "/tmp"

runs = int(os.environ.get("RUNS", "1"))
all_results = []

for i in range(1, runs + 1):
    path = os.path.join(results_dir, f"run-{i}.json")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path) as f:
            r = json.load(f)
            r["run"] = i
            all_results.append(r)

if not all_results:
    print("ERROR: No results collected. Check Modal output above.")
    sys.exit(1)

total = all_results[0]["total_questions"]

# Summary table
print(f"  {'Run':>4}  {'Seed':>6}  {'Base':>10}  {'Fine-tuned':>12}  {'Delta':>7}")
print(f"  {'─'*4}  {'─'*6}  {'─'*10}  {'─'*12}  {'─'*7}")
for r in all_results:
    b, ft = r["base_score"], r["finetuned_score"]
    print(f"  {r['run']:>4}  {r['seed']:>6}  {b:>4}/{total:<4}  {ft:>6}/{total:<4}  +{ft-b:>4}")

if len(all_results) > 1:
    avg_b = sum(r["base_score"] for r in all_results) / len(all_results)
    avg_ft = sum(r["finetuned_score"] for r in all_results) / len(all_results)
    print(f"  {'─'*4}  {'─'*6}  {'─'*10}  {'─'*12}  {'─'*7}")
    print(f"  {'AVG':>4}  {'':>6}  {avg_b:>6.1f}/{total:<4}  {avg_ft:>8.1f}/{total:<4}  +{avg_ft-avg_b:>4.1f}")

# Per-question breakdown from last run
print()
print("  Per-question breakdown (last run):")
print(f"  {'#':>3}  {'Base':>5}  {'FT':>5}  {'Facts':>7}  Question")
print(f"  {'─'*3}  {'─'*5}  {'─'*5}  {'─'*7}  {'─'*50}")
last = all_results[-1]
for q in last["questions"]:
    b = "PASS" if q["base_correct"] else "FAIL"
    ft = "PASS" if q["ft_correct"] else "FAIL"
    facts = f"{q['ft_facts_hit']}/{q['facts_total']}"
    print(f"  {q['idx']:>3}  {b:>5}  {ft:>5}  {facts:>7}  {q['question'][:50]}")

# Statistical note
print()
if len(all_results) == 1:
    print("  NOTE: Single run. Use --runs 3 for averaged results.")
else:
    scores = [r["finetuned_score"] for r in all_results]
    mean = sum(scores) / len(scores)
    variance = sum((s - mean) ** 2 for s in scores) / len(scores)
    std = variance ** 0.5
    print(f"  Std dev of fine-tuned score: {std:.1f} across {len(all_results)} runs")
PYEOF

echo ""
echo "Done. Full logs: $RESULTS_DIR/run-*.log"

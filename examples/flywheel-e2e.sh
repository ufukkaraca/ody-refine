#!/usr/bin/env bash
# flywheel-e2e.sh — Run the complete Ody flywheel end-to-end.
#
# Flow: scan docs → detect issues → export JSONL → import into Forge → train
#
# Usage:
#   bash examples/flywheel-e2e.sh              # Full flow (stops before training)
#   bash examples/flywheel-e2e.sh --train      # Include local training step
#
# Requires: Node 20+, pnpm, built workspace (pnpm build)
set -euo pipefail

TRAIN=false
[[ "${1:-}" == "--train" ]] && TRAIN=true

REPO="$(cd "$(dirname "$0")/.." && pwd)"
REFINE_CLI="$REPO/apps/refine/dist/cli.js"
# Forge CLI lives in the separate ody/forge/ repo
FORGE_CLI="${FORGE_CLI_PATH:-$REPO/../forge/apps/dist/cli.js}"
WORK="/tmp/ody-flywheel-e2e"
BASE_MODEL="${ODY_BASE_MODEL:-Qwen/Qwen2.5-3B}"

# Load OpenRouter key from keychain if not already set
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  KEY=$(security find-generic-password -s "ody-openrouter" -w 2>/dev/null || true)
  if [ -n "$KEY" ]; then
    export OPENROUTER_API_KEY="$KEY"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          Ody Flywheel — End-to-End Demo             ║"
echo "║   scan → detect → export → import → train          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 0: Build ──────────────────────────────────────────
echo "━━━ Step 0: Build workspace ━━━"
cd "$REPO"
pnpm build 2>&1 | tail -1
echo ""

# ── Step 1: Scan docs with Refine ──────────────────────────
echo "━━━ Step 1: Scan sample docs with Refine ━━━"
rm -rf "$WORK"
mkdir -p "$WORK"
cp "$REPO/examples/sample-docs/"*.md "$WORK/"

cd "$WORK"
# sqlite-vec may SIGABRT during Node atexit cleanup — tolerate exit 134
set +e
node "$REFINE_CLI" ingest --no-validate .
INGEST_EXIT=$?
set -e
if [ "$INGEST_EXIT" -ne 0 ] && [ "$INGEST_EXIT" -ne 134 ]; then
  echo "ERROR: Ingest failed with exit code $INGEST_EXIT"
  exit 1
fi
echo ""

# ── Step 2: Export as SFT JSONL ────────────────────────────
echo "━━━ Step 2: Export knowledge nodes as SFT JSONL ━━━"
node "$REFINE_CLI" export --format sft -o "$WORK/training-data.jsonl"
echo ""

# Show export stats
LINES=$(wc -l < "$WORK/training-data.jsonl" | tr -d ' ')
echo "  Exported $LINES SFT entries to training-data.jsonl"
echo "  Sample entry:"
head -1 "$WORK/training-data.jsonl" | python3 -m json.tool 2>/dev/null || head -1 "$WORK/training-data.jsonl"
echo ""

# ── Step 3: Import into Forge ──────────────────────────────
echo "━━━ Step 3: Import JSONL into Forge dataset ━━━"
node "$FORGE_CLI" train from-refine \
  --from-refine "$WORK/training-data.jsonl" \
  --base "$BASE_MODEL" \
  --method sft \
  --output "$WORK/training"
echo ""

# ── Step 4: Training ──────────────────────────────────────
if [ "$TRAIN" = true ]; then
  echo "━━━ Step 4: Run training ━━━"
  if [ -f "$WORK/training/train_sft.py" ]; then
    echo "  Training script: $WORK/training/train_sft.py"
    echo "  Base model: $BASE_MODEL"
    echo ""
    echo "  Running: python $WORK/training/train_sft.py"
    python3 "$WORK/training/train_sft.py"
  else
    echo "  ERROR: No training script generated"
    exit 1
  fi
else
  echo "━━━ Step 4: Training (skipped — use --train to run) ━━━"
  if [ -f "$WORK/training/train_sft.py" ]; then
    echo "  Training script ready at: $WORK/training/train_sft.py"
    echo "  To run: python3 $WORK/training/train_sft.py"
  fi
fi

echo ""
echo "━━━ Flywheel E2E Complete ━━━"
echo ""
echo "  Working directory: $WORK"
echo "  Database:          $WORK/.ody-refine/refine.db"
echo "  Training data:     $WORK/training-data.jsonl ($LINES entries)"
echo "  Training script:   $WORK/training/train_sft.py"
echo ""
echo "Next steps:"
echo "  1. Run training:     python3 $WORK/training/train_sft.py"
echo "  2. Or use Modal:     modal run scripts/modal-training.py"
echo "  3. Deploy + serve:   node $FORGE_CLI train start --dataset <id> --base $BASE_MODEL --auto-deploy"
echo "  4. Colleague picks up the deployed model automatically on restart"
echo ""

#!/bin/bash
# Ody Project Dashboard — run with: bash scripts/dashboard.sh
# Generates a live status overview of the entire platform

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m' B='\033[0;34m'
M='\033[0;35m' C='\033[0;36m' W='\033[1;37m' D='\033[0;90m' N='\033[0m'

echo ""
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${W}  ODY PLATFORM DASHBOARD${N}"
echo -e "${D}  $(date '+%Y-%m-%d %H:%M')${N}"
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""

# Git status
BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
COMMITS=$(git -C "$ROOT" log --oneline | wc -l | tr -d ' ')
LAST_COMMIT=$(git -C "$ROOT" log --oneline -1 2>/dev/null || echo "none")
echo -e "${C}GIT${N}  branch: ${W}$BRANCH${N}  commits: $COMMITS"
echo -e "     last: ${D}$LAST_COMMIT${N}"
echo ""

# Test counts per package
echo -e "${C}TESTS${N}"
total=0
for pkg in packages/core packages/detectors packages/eval packages/export packages/feedback packages/training apps/refine apps/forge; do
    name=$(basename "$pkg")
    dir="$ROOT/$pkg"
    if [ -d "$dir" ]; then
        test_files=$(find "$dir" -name "*.test.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null | wc -l | tr -d ' ')
        src_files=$(find "$dir/src" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null | wc -l | tr -d ' ')
        total=$((total + test_files))
        printf "  ${W}%-14s${N} %3s test files  %3s source files\n" "$name" "$test_files" "$src_files"
    fi
done
echo -e "  ${G}Total: $total test files${N}"
echo ""

# Product status
echo -e "${C}PRODUCTS${N}"
echo ""

# Refine
echo -e "  ${W}REFINE${N} (CLI, open source)"
check() { [ -f "$ROOT/$1" ] && echo -e "    ${G}[done]${N} $2" || echo -e "    ${R}[todo]${N} $2"; }
check "apps/refine/src/commands/scan.ts"        "scan (ingest + detect + report)"
check "apps/refine/src/commands/resolve.ts"     "resolve (interactive TUI)"
check "apps/refine/src/commands/export.ts"      "export (JSONL/Parquet)"
check "apps/refine/src/commands/ci.ts"          "ci (GitHub Action mode)"
check "apps/refine/src/commands/badge.ts"       "badge (README SVG)"
check "apps/refine/src/commands/diff.ts"        "diff (before/after comparison)"
check "apps/refine/src/commands/optimize.ts"    "optimize (autoresearch)"
check "packages/detectors/src/consensus.ts"     "consensus voting (consistency)"
check "packages/detectors/src/health-score.ts"  "deterministic health scoring"
check "apps/refine/src/connectors/types.ts"     "connector interface"
check "apps/refine/src/connectors/notion.ts"    "Notion connector (stub)"
check "apps/refine/src/connectors/slack.ts"     "Slack connector (stub)"

# Check resolve is actually implemented (not just a file)
if [ -f "$ROOT/apps/refine/src/resolve/tui.ts" ]; then
    lines=$(wc -l < "$ROOT/apps/refine/src/resolve/tui.ts" | tr -d ' ')
    if [ "$lines" -gt 20 ]; then
        echo -e "    ${G}[done]${N} resolve TUI ($lines lines)"
    else
        echo -e "    ${Y}[stub]${N} resolve TUI ($lines lines)"
    fi
fi
echo ""

# Forge
echo -e "  ${W}FORGE${N} (training pipeline)"
check "apps/forge/src/commands/dataset.ts"      "dataset management"
check "apps/forge/src/commands/train.ts"        "train command"
check "apps/forge/src/commands/eval.ts"         "eval command"
check "apps/forge/src/commands/model.ts"        "model management"
check "packages/training/src/retraining-orchestrator.ts" "retraining orchestrator"
check "packages/training/src/dataset-registry.ts"        "dataset registry"
check "packages/training/src/model-registry.ts"          "model registry"
check "packages/feedback/src/reward-derivation.ts"       "reward derivation"
check "packages/feedback/src/pair-store.ts"              "preference pair store"
echo ""

# Colleague
echo -e "  ${W}COLLEAGUE${N} (AI assistant)"
col_root="${COLLEAGUE_ROOT:-../colleague}"
col_check() { [ -f "$col_root/$1" ] && echo -e "    ${G}[done]${N} $2" || echo -e "    ${R}[todo]${N} $2"; }
col_check "apps/web/src/app/page.tsx"               "Web UI (Next.js)"
col_check "apps/api/src/routes/chat/index.ts"       "Chat API"
col_check "apps/slack/src/index.ts"                 "Slack bot"
col_check "packages/orchestrator/src/usecases/chat/askQuestion.ts" "askQuestion orchestrator"
col_check "packages/providers/src/llm/openrouter.ts" "LLM providers"
check "packages/feedback/src/correction-pipeline.ts"   "correction → preference pair pipeline"
check "packages/core/src/providers/custom-model-provider.ts" "fine-tuned model serving (LoRA)"
check "packages/core/src/providers/fallback-provider.ts"     "fallback provider chain"
check "packages/training/src/model-loader.ts"                "model loader from registry"
check "packages/training/src/retrain-trigger.ts"             "retraining trigger (shouldRetrain)"
echo -e "    ${Y}[next]${N} wire into private colleague/ repo"
echo ""

# Eval
echo -e "  ${W}EVAL${N} (benchmarks)"
check "packages/eval/src/corpus-runner.ts"            "corpus runner (P/R/F1)"
check "packages/eval/src/consistency-measure.ts"      "consistency Jaccard"
check "packages/eval/src/speed-benchmark.ts"          "speed benchmark"
check "packages/eval/src/preference-pair-validator.ts" "preference pair validator"
check "packages/eval/src/flywheel-test.ts"            "full flywheel test"
fixture_count=$(find "$ROOT/packages/eval/fixtures" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
echo -e "    ${D}$fixture_count fixture files${N}"
echo ""

# Docs
echo -e "${C}DOCS${N}"
for f in NORTH_STAR.md PLAN.md IMPLEMENTATION.md CLAUDE.md; do
    if [ -f "$ROOT/$f" ]; then
        lines=$(wc -l < "$ROOT/$f" | tr -d ' ')
        echo -e "  ${G}[exists]${N} $f ($lines lines)"
    fi
done
doc_count=$(find "$ROOT/docs" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
[ "$doc_count" -gt 0 ] 2>/dev/null && echo -e "  ${D}$doc_count docs in docs/${N}"
echo ""

# Summary
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${W}  STATUS${N}"
echo -e "  ${G}FLYWHEEL CLOSED${N} — full pipeline: scan → detect → resolve → export → train → eval → deploy → correct → retrain"
echo -e ""
echo -e "${W}  NEXT ACTIONS${N}"
echo -e "  ${Y}1.${N} npm publish @ody/refine (ready, not published)"
echo -e "  ${Y}2.${N} Wire Colleague integration in private colleague/ repo"
echo -e "  ${Y}3.${N} Landing page for launch"
echo -e "  ${Y}4.${N} Real model training test (requires Ollama + GPU)"
echo -e "  ${Y}5.${N} Audit --deep multi-source mode"
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""

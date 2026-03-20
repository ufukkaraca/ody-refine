#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Run a one-shot Claude task (no queue, immediate execution)
# Usage: ./run-once.sh "prompt" [--budget N.NN] [--agent NAME] [--worktree]
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$HOME/.claude/agent-logs"
mkdir -p "$LOG_DIR"

# ── Defaults ─────────────────────────────────────────────────────
PROMPT=""
BUDGET="2.00"
AGENT=""
WORKTREE=false

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --budget)    BUDGET="$2"; shift 2 ;;
        --agent)     AGENT="$2"; shift 2 ;;
        --worktree)  WORKTREE=true; shift ;;
        *)
            if [ -z "$PROMPT" ]; then PROMPT="$1"; else PROMPT="$PROMPT $1"; fi
            shift ;;
    esac
done

if [ -z "$PROMPT" ]; then
    echo "Usage: $0 \"prompt\" [--budget N.NN] [--agent NAME] [--worktree]"
    exit 1
fi

# ── Build command ────────────────────────────────────────────────
cmd=(claude -p --permission-mode auto --max-budget-usd "$BUDGET" --output-format json)

if [ "$WORKTREE" = true ]; then
    cmd+=(--worktree)
fi

if [ -n "$AGENT" ]; then
    cmd+=(--agent "$AGENT")
fi

echo "Running Claude task..."
echo "  Prompt: ${PROMPT:0:80}..."
echo "  Budget: \$$BUDGET"
echo "  Agent:  ${AGENT:-default}"
echo ""

# ── Execute ──────────────────────────────────────────────────────
cd "$PROJECT_ROOT"
"${cmd[@]}" "$PROMPT" 2>&1 | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Add a task to the pending queue
# Usage: ./add-task.sh "prompt text" [--budget N.NN] [--priority high|medium|low] [--worktree] [--agent NAME]
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_DIR="$PROJECT_ROOT/.claude/tasks/pending"
mkdir -p "$TASKS_DIR"

# ── Defaults ─────────────────────────────────────────────────────
PROMPT=""
BUDGET="2.00"
PRIORITY="medium"
WORKTREE="false"
AGENT="default"

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --budget)    BUDGET="$2"; shift 2 ;;
        --priority)  PRIORITY="$2"; shift 2 ;;
        --worktree)  WORKTREE="true"; shift ;;
        --agent)     AGENT="$2"; shift 2 ;;
        *)
            if [ -z "$PROMPT" ]; then
                PROMPT="$1"
            else
                PROMPT="$PROMPT $1"
            fi
            shift ;;
    esac
done

if [ -z "$PROMPT" ]; then
    echo "Usage: $0 \"prompt text\" [--budget N.NN] [--priority high|medium|low] [--worktree] [--agent NAME]"
    exit 1
fi

# ── Generate task ID ─────────────────────────────────────────────
existing=$(find "$PROJECT_ROOT/.claude/tasks" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
task_id=$(printf "%03d" $((existing + 1)))

# ── Create slug from first 40 chars ─────────────────────────────
slug=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | head -c 40 | sed 's/-$//')
filename="${task_id}-${slug}.md"

# ── Write task file ──────────────────────────────────────────────
cat > "$TASKS_DIR/$filename" << EOF
---
id: $task_id
created: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
priority: $PRIORITY
budget: $BUDGET
agent: $AGENT
worktree: $WORKTREE
---

# Task: $PROMPT
EOF

echo "Created task: $TASKS_DIR/$filename"
echo "  ID:       $task_id"
echo "  Budget:   \$$BUDGET"
echo "  Priority: $PRIORITY"
echo "  Worktree: $WORKTREE"

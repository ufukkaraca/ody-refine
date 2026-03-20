#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Show task queue status and agent health
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_DIR="$PROJECT_ROOT/.claude/tasks"

count_tasks() {
    find "$TASKS_DIR/$1" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' '
}

echo "═══════════════════════════════════════════"
echo "  Claude Autonomous Agent Status"
echo "═══════════════════════════════════════════"
echo ""
echo "Task Queue:"
echo "  Pending:     $(count_tasks pending)"
echo "  In-Progress: $(count_tasks in-progress)"
echo "  Done:        $(count_tasks done)"
echo "  Failed:      $(count_tasks failed)"
echo ""

# ── Show pending tasks ───────────────────────────────────────────
pending=$(find "$TASKS_DIR/pending" -name "*.md" -type f 2>/dev/null | sort)
if [ -n "$pending" ]; then
    echo "Pending Tasks:"
    while IFS= read -r f; do
        name=$(basename "$f" .md)
        priority=$(sed -n '/^---$/,/^---$/p' "$f" | grep "^priority:" | sed 's/priority: *//')
        echo "  [$priority] $name"
    done <<< "$pending"
    echo ""
fi

# ── Show in-progress ────────────────────────────────────────────
in_progress=$(find "$TASKS_DIR/in-progress" -name "*.md" -type f 2>/dev/null | sort)
if [ -n "$in_progress" ]; then
    echo "In-Progress Tasks:"
    while IFS= read -r f; do
        echo "  $(basename "$f" .md)"
    done <<< "$in_progress"
    echo ""
fi

# ── Show recent completions ─────────────────────────────────────
done_tasks=$(find "$TASKS_DIR/done" -name "*.md" -type f 2>/dev/null -newer "$TASKS_DIR" | sort -r | head -5)
if [ -n "$done_tasks" ]; then
    echo "Recent Completions:"
    while IFS= read -r f; do
        name=$(basename "$f" .md)
        completed=$(grep "completed:" "$f" 2>/dev/null | tail -1 | sed 's/.*completed: *//' || echo "unknown")
        echo "  $name (completed: $completed)"
    done <<< "$done_tasks"
    echo ""
fi

# ── Show agent health ───────────────────────────────────────────
echo "Agents:"
if launchctl list 2>/dev/null | grep -q "com.ody.claude"; then
    launchctl list 2>/dev/null | grep "com.ody.claude" | while read -r pid status label; do
        state="running"
        if [ "$pid" = "-" ]; then state="idle"; fi
        echo "  $label: $state (exit: $status)"
    done
else
    echo "  No launchd agents installed. Run: ./scripts/agents/install.sh"
fi

echo ""

# ── Show today's log tail ───────────────────────────────────────
LOG_FILE="$HOME/.claude/agent-logs/$(date +%Y-%m-%d).log"
if [ -f "$LOG_FILE" ]; then
    echo "Recent Log (last 10 lines):"
    tail -10 "$LOG_FILE" | sed 's/^/  /'
fi

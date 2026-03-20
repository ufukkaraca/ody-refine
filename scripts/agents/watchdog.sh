#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Watchdog — ensures the tmux agent session stays alive
# Run this via launchd to auto-restart crashed agents.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$HOME/.claude/agent-logs"
SESSION_NAME="ody-agents"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [watchdog] $*" >> "$LOG_DIR/$(date +%Y-%m-%d).log"
}

# ── Check if the tmux session is running ─────────────────────────
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log "Agent session not running, restarting..."
    "$PROJECT_ROOT/scripts/agents/start-tmux.sh"
    log "Agent session restarted"
else
    log "Agent session healthy"
fi

# ── Check if dispatch lock is stale ─────────────────────────────
LOCK_FILE="/tmp/claude-dispatch.lock"
if [ -f "$LOCK_FILE" ]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [ "$lock_age" -gt 3600 ]; then
        log "Stale lock file detected (${lock_age}s old), removing"
        rm -f "$LOCK_FILE"
    fi
fi

# ── Check for zombie in-progress tasks ───────────────────────────
while IFS= read -r task; do
    if [ -z "$task" ]; then continue; fi
    task_age=$(( $(date +%s) - $(stat -f %m "$task" 2>/dev/null || stat -c %Y "$task" 2>/dev/null || echo 0) ))
    if [ "$task_age" -gt 7200 ]; then  # 2 hours
        task_name=$(basename "$task")
        log "Task stuck for ${task_age}s, moving to failed: $task_name"
        {
            echo ""
            echo "---"
            echo "## Failure"
            echo "- reason: watchdog timeout (${task_age}s)"
            echo "- detected: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
        } >> "$task"
        mv "$task" "$PROJECT_ROOT/.claude/tasks/failed/$task_name"
    fi
done < <(find "$PROJECT_ROOT/.claude/tasks/in-progress" -name "*.md" -type f 2>/dev/null)

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Task Dispatcher — picks up pending tasks and runs Claude on them
# Called by launchd every 5 minutes, or manually.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_DIR="$PROJECT_ROOT/.claude/tasks"
LOG_DIR="$HOME/.claude/agent-logs"
LOCK_FILE="/tmp/claude-dispatch.lock"
MAX_CONCURRENT=1  # One task at a time by default
DEFAULT_BUDGET="2.00"

mkdir -p "$LOG_DIR" "$TASKS_DIR/pending" "$TASKS_DIR/in-progress" "$TASKS_DIR/done" "$TASKS_DIR/failed"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [dispatch] $*" | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"
}

# ── Lock check (prevent overlapping dispatches) ──────────────────
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Another dispatch is running (PID $LOCK_PID), skipping"
        exit 0
    else
        log "Stale lock file found, removing"
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Count in-progress tasks ──────────────────────────────────────
in_progress=$(find "$TASKS_DIR/in-progress" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$in_progress" -ge "$MAX_CONCURRENT" ]; then
    log "Max concurrent tasks ($MAX_CONCURRENT) reached, skipping"
    exit 0
fi

# ── Pick up oldest pending task ──────────────────────────────────
task_file=$(find "$TASKS_DIR/pending" -name "*.md" -type f 2>/dev/null | sort | head -1)
if [ -z "$task_file" ]; then
    log "No pending tasks"
    exit 0
fi

task_name=$(basename "$task_file")
log "Picking up task: $task_name"

# ── Move to in-progress ─────────────────────────────────────────
mv "$task_file" "$TASKS_DIR/in-progress/$task_name"
task_file="$TASKS_DIR/in-progress/$task_name"

# ── Parse task metadata ─────────────────────────────────────────
parse_frontmatter() {
    local key="$1"
    local file="$2"
    sed -n '/^---$/,/^---$/p' "$file" | grep "^${key}:" | sed "s/^${key}: *//" | tr -d '"' | tr -d "'"
}

budget=$(parse_frontmatter "budget" "$task_file")
budget="${budget:-$DEFAULT_BUDGET}"

use_worktree=$(parse_frontmatter "worktree" "$task_file")
agent_name=$(parse_frontmatter "agent" "$task_file")

# ── Extract prompt (everything after the second ---) ─────────────
prompt=$(sed '1,/^---$/d; 1,/^---$/d' "$task_file")

if [ -z "$prompt" ]; then
    log "ERROR: Empty prompt in $task_name"
    mv "$task_file" "$TASKS_DIR/failed/$task_name"
    exit 1
fi

# ── Build Claude command ─────────────────────────────────────────
cmd=(claude -p --permission-mode auto --max-budget-usd "$budget" --output-format json)

if [ "$use_worktree" = "true" ]; then
    cmd+=(--worktree)
fi

if [ -n "$agent_name" ] && [ "$agent_name" != "default" ]; then
    cmd+=(--agent "$agent_name")
fi

# ── Execute ──────────────────────────────────────────────────────
log "Running: ${cmd[*]} (budget: \$$budget)"
start_time=$(date +%s)

set +e
result=$("${cmd[@]}" "$prompt" 2>&1)
exit_code=$?
set -e

end_time=$(date +%s)
duration=$((end_time - start_time))

# ── Append result to task file ───────────────────────────────────
{
    echo ""
    echo "---"
    echo "## Result"
    echo "- exit_code: $exit_code"
    echo "- duration: ${duration}s"
    echo "- completed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo ""
    echo '```json'
    echo "$result"
    echo '```'
} >> "$task_file"

# ── Move to done or failed ──────────────────────────────────────
if [ $exit_code -eq 0 ]; then
    log "Task $task_name completed successfully (${duration}s)"
    mv "$task_file" "$TASKS_DIR/done/$task_name"
else
    log "Task $task_name FAILED (exit=$exit_code, ${duration}s)"
    mv "$task_file" "$TASKS_DIR/failed/$task_name"
fi

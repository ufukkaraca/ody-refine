#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Morning Brief Agent — generates a daily status report
# Called by launchd at 06:00 daily.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$HOME/.claude/agent-logs"
BRIEF_DIR="$PROJECT_ROOT/.claude/briefs"

mkdir -p "$LOG_DIR" "$BRIEF_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [morning-brief] $*" | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"
}

log "Generating morning brief"

# ── Gather context ───────────────────────────────────────────────
yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)

# Git activity since yesterday
cd "$PROJECT_ROOT"
git_log=$(git log --oneline --since="$yesterday" 2>/dev/null || echo "No commits")
git_status=$(git status --short 2>/dev/null || echo "Clean")

# Task queue status
pending=$(find "$PROJECT_ROOT/.claude/tasks/pending" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
done_today=$(find "$PROJECT_ROOT/.claude/tasks/done" -name "*.md" -newer "$PROJECT_ROOT/.claude/tasks/done" -type f 2>/dev/null | wc -l | tr -d ' ')
failed_today=$(find "$PROJECT_ROOT/.claude/tasks/failed" -name "*.md" -newer "$PROJECT_ROOT/.claude/tasks/failed" -type f 2>/dev/null | wc -l | tr -d ' ')

# Yesterday's agent log
yesterday_log=""
if [ -f "$LOG_DIR/$yesterday.log" ]; then
    yesterday_log=$(tail -50 "$LOG_DIR/$yesterday.log")
fi

# ── Generate brief using Claude ──────────────────────────────────
prompt="Generate a morning briefing for Ufuk. Today is $(date '+%A, %B %d, %Y').

Context about the project: This is the ody-platform open source repo (Refine CLI).
Read CLAUDE.md for project context.

Here is what happened since yesterday:

## Git Activity
$git_log

## Git Status
$git_status

## Task Queue
- Pending tasks: $pending
- Completed today: $done_today
- Failed today: $failed_today

## Agent Activity Log (yesterday)
$yesterday_log

Write a concise morning brief covering:
1. What was accomplished overnight
2. What failed and needs attention
3. What's queued up next
4. Any blockers or concerns
5. Suggested priorities for today

Keep it under 500 words. Be direct — this is for a solo founder."

brief=$(claude -p \
    --permission-mode plan \
    --max-budget-usd 0.50 \
    "$prompt" 2>&1 || echo "Failed to generate brief")

# ── Save brief ───────────────────────────────────────────────────
brief_file="$BRIEF_DIR/$(date +%Y-%m-%d).md"
cat > "$brief_file" << EOF
# Morning Brief — $(date '+%A, %B %d, %Y')

$brief
EOF

log "Morning brief saved to $brief_file"

# ── Also update the .claude/morning-briefing.md ──────────────────
cp "$brief_file" "$PROJECT_ROOT/.claude/morning-briefing.md"
log "Updated .claude/morning-briefing.md"

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Linear Sync Agent — checks Linear for issues assigned to Claude
# and creates tasks in the file queue.
#
# Requires: LINEAR_API_KEY env var
# Called by launchd every 15 minutes.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$HOME/.claude/agent-logs"
STATE_FILE="$PROJECT_ROOT/.claude/tasks/.linear-sync-state"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [linear-sync] $*" | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"
}

# ── Check for Linear API key ────────────────────────────────────
if [ -z "${LINEAR_API_KEY:-}" ]; then
    log "LINEAR_API_KEY not set, skipping"
    exit 0
fi

# ── Get last sync timestamp ─────────────────────────────────────
last_sync=""
if [ -f "$STATE_FILE" ]; then
    last_sync=$(cat "$STATE_FILE")
fi

log "Checking Linear for new issues (since: ${last_sync:-never})"

# ── Query Linear API for issues labeled "claude-auto" ────────────
# Using the Linear GraphQL API directly (no external deps)
filter_clause=""
if [ -n "$last_sync" ]; then
    filter_clause=', updatedAt: { gt: "'"$last_sync"'" }'
fi

query='{
  "query": "query { issues(filter: { labels: { name: { eq: \"claude-auto\" } }, state: { type: { in: [\"backlog\", \"unstarted\", \"started\"] } }'"$filter_clause"' }) { nodes { id identifier title description priority state { name } labels { nodes { name } } } } }"
}'

response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "$query" \
    "https://api.linear.app/graphql" 2>&1)

# ── Parse issues (using basic JSON parsing — no jq dependency) ───
# If jq is available, use it; otherwise fall back to claude for parsing
if command -v jq &>/dev/null; then
    issues=$(echo "$response" | jq -r '.data.issues.nodes[] | "\(.identifier)|\(.title)|\(.description // "")"' 2>/dev/null || echo "")
else
    log "jq not found, using basic parsing"
    issues=""
fi

if [ -z "$issues" ]; then
    log "No new issues found"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_FILE"
    exit 0
fi

# ── Create tasks for each issue ──────────────────────────────────
count=0
while IFS='|' read -r id title description; do
    # Skip if we already have a task for this issue
    if find "$PROJECT_ROOT/.claude/tasks" -name "*${id}*" -type f 2>/dev/null | grep -q .; then
        log "Skipping $id — already has a task"
        continue
    fi

    # Map Linear priority (1=urgent, 2=high, 3=medium, 4=low)
    priority="medium"

    prompt="Linear Issue $id: $title"
    if [ -n "$description" ]; then
        prompt="$prompt

$description"
    fi
    prompt="$prompt

Work on this issue. Read the codebase context from CLAUDE.md, PLAN.md, and IMPLEMENTATION.md.
When done, commit your changes with a message referencing $id."

    "$PROJECT_ROOT/scripts/agents/add-task.sh" \
        "$prompt" \
        --budget 5.00 \
        --priority "$priority" \
        --worktree

    log "Created task for $id: $title"
    count=$((count + 1))
done <<< "$issues"

log "Created $count new tasks from Linear"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_FILE"

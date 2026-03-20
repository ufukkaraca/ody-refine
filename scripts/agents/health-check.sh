#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Health Check Agent — runs typecheck + tests, reports failures
# Called by launchd every 30 minutes.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$HOME/.claude/agent-logs"
REPORT_FILE="$PROJECT_ROOT/.claude/tasks/done/health-$(date +%Y%m%d-%H%M%S).md"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [health] $*" | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"
}

log "Starting health check"

# ── Run checks ───────────────────────────────────────────────────
cd "$PROJECT_ROOT"

errors=""

# Typecheck
log "Running typecheck..."
if ! pnpm typecheck 2>&1 | tail -20 > /tmp/claude-health-typecheck.txt; then
    errors="$errors\n- Typecheck FAILED"
    log "Typecheck FAILED"
fi

# Tests
log "Running tests..."
if ! pnpm test 2>&1 | tail -40 > /tmp/claude-health-test.txt; then
    errors="$errors\n- Tests FAILED"
    log "Tests FAILED"
fi

# Lint
log "Running lint..."
if ! pnpm lint 2>&1 | tail -20 > /tmp/claude-health-lint.txt; then
    errors="$errors\n- Lint FAILED"
    log "Lint FAILED"
fi

# ── If failures detected, create a fix task ──────────────────────
if [ -n "$errors" ]; then
    log "Health check found issues, creating fix task"

    # Auto-create a task to fix it
    "$PROJECT_ROOT/scripts/agents/add-task.sh" \
        "Health check failed. Fix the following issues: $(echo -e "$errors"). Run pnpm typecheck, pnpm test, and pnpm lint. Fix all errors and commit." \
        --budget 3.00 \
        --priority high \
        --worktree

    log "Fix task created"
else
    log "Health check passed"
fi

# ── Write report ─────────────────────────────────────────────────
mkdir -p "$(dirname "$REPORT_FILE")"
cat > "$REPORT_FILE" << EOF
---
id: health-$(date +%Y%m%d-%H%M%S)
created: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
type: health-check
---

# Health Check Report — $(date '+%Y-%m-%d %H:%M')

$(if [ -n "$errors" ]; then echo "## FAILURES"; echo -e "$errors"; else echo "All checks passed."; fi)

## Typecheck Output
\`\`\`
$(cat /tmp/claude-health-typecheck.txt 2>/dev/null || echo "N/A")
\`\`\`

## Test Output
\`\`\`
$(cat /tmp/claude-health-test.txt 2>/dev/null || echo "N/A")
\`\`\`

## Lint Output
\`\`\`
$(cat /tmp/claude-health-lint.txt 2>/dev/null || echo "N/A")
\`\`\`
EOF

log "Health check complete"

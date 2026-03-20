#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Start a persistent tmux session running the dispatch loop
# This is the "always-on" agent — it continuously processes tasks.
#
# Usage:
#   ./start-tmux.sh              # Start the agent
#   ./start-tmux.sh --attach     # Start and attach
#   ./start-tmux.sh --stop       # Stop the agent
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SESSION_NAME="ody-agents"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DISPATCH="$PROJECT_ROOT/scripts/agents/dispatch.sh"

case "${1:-}" in
    --stop)
        if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
            tmux kill-session -t "$SESSION_NAME"
            echo "Stopped agent session: $SESSION_NAME"
        else
            echo "No agent session running"
        fi
        exit 0
        ;;
    --attach)
        ATTACH=true
        ;;
    *)
        ATTACH=false
        ;;
esac

# ── Check if already running ────────────────────────────────────
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Agent session already running: $SESSION_NAME"
    if [ "$ATTACH" = true ]; then
        tmux attach -t "$SESSION_NAME"
    else
        echo "Use: tmux attach -t $SESSION_NAME"
    fi
    exit 0
fi

# ── Create the dispatch loop script ─────────────────────────────
LOOP_SCRIPT=$(mktemp /tmp/claude-agent-loop.XXXXXX.sh)
cat > "$LOOP_SCRIPT" << 'INNEREOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="__PROJECT_ROOT__"
DISPATCH="__DISPATCH__"
LOG_DIR="$HOME/.claude/agent-logs"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [loop] $*" | tee -a "$LOG_DIR/$(date +%Y-%m-%d).log"
}

log "Agent loop started (PID: $$)"
log "Watching: $PROJECT_ROOT/.claude/tasks/pending/"

POLL_INTERVAL=60  # Check every 60 seconds

while true; do
    # Check for pending tasks
    pending=$(find "$PROJECT_ROOT/.claude/tasks/pending" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

    if [ "$pending" -gt 0 ]; then
        log "Found $pending pending task(s), dispatching..."
        bash "$DISPATCH" || log "Dispatch exited with error"
    fi

    # Heartbeat every 10 minutes
    if [ $(( $(date +%s) % 600 )) -lt "$POLL_INTERVAL" ]; then
        in_progress=$(find "$PROJECT_ROOT/.claude/tasks/in-progress" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
        done_count=$(find "$PROJECT_ROOT/.claude/tasks/done" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
        log "Heartbeat — pending: $pending, in-progress: $in_progress, done: $done_count"
    fi

    sleep "$POLL_INTERVAL"
done
INNEREOF

# Replace placeholders
sed -i '' "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" "$LOOP_SCRIPT" 2>/dev/null || \
    sed -i "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" "$LOOP_SCRIPT"
sed -i '' "s|__DISPATCH__|$DISPATCH|g" "$LOOP_SCRIPT" 2>/dev/null || \
    sed -i "s|__DISPATCH__|$DISPATCH|g" "$LOOP_SCRIPT"

chmod +x "$LOOP_SCRIPT"

# ── Start tmux session ──────────────────────────────────────────
tmux new-session -d -s "$SESSION_NAME" "bash $LOOP_SCRIPT"

echo "Agent session started: $SESSION_NAME"
echo "  Poll interval: 60s"
echo "  Task dir: $PROJECT_ROOT/.claude/tasks/"
echo ""
echo "Commands:"
echo "  tmux attach -t $SESSION_NAME    # Watch the agent"
echo "  ./scripts/agents/status.sh      # Check status"
echo "  ./scripts/agents/start-tmux.sh --stop  # Stop"

if [ "$ATTACH" = true ]; then
    tmux attach -t "$SESSION_NAME"
fi

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Stop all autonomous agents — kill switch
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

echo "Stopping all Claude autonomous agents..."

# ── Unload launchd agents ────────────────────────────────────────
for plist in ~/Library/LaunchAgents/com.ody.claude.*.plist; do
    if [ -f "$plist" ]; then
        label=$(basename "$plist" .plist)
        if launchctl list "$label" &>/dev/null; then
            launchctl unload "$plist" 2>/dev/null || true
            echo "  [-] Unloaded: $label"
        else
            echo "  [.] Not running: $label"
        fi
    fi
done

# ── Kill tmux agent session ─────────────────────────────────────
if tmux has-session -t ody-agents 2>/dev/null; then
    tmux kill-session -t ody-agents
    echo "  [-] Killed tmux session: ody-agents"
else
    echo "  [.] No tmux session running"
fi

# ── Remove lock files ───────────────────────────────────────────
rm -f /tmp/claude-dispatch.lock
echo "  [-] Cleaned lock files"

echo ""
echo "All agents stopped."
echo "To restart: ./scripts/agents/install.sh && for f in ~/Library/LaunchAgents/com.ody.claude.*.plist; do launchctl load \"\$f\"; done"

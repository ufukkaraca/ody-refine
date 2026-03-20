#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Install autonomous agent infrastructure
# Sets up launchd agents (macOS) for scheduled tasks.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/.claude/agent-logs"

mkdir -p "$AGENTS_DIR" "$LOG_DIR"

echo "Installing Claude autonomous agents..."
echo "  Project: $PROJECT_ROOT"
echo ""

# ── Make all scripts executable ──────────────────────────────────
chmod +x "$PROJECT_ROOT/scripts/agents/"*.sh

# ── 1. Task Dispatcher (every 5 minutes) ────────────────────────
cat > "$AGENTS_DIR/com.ody.claude.dispatch.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ody.claude.dispatch</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_ROOT/scripts/agents/dispatch.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/dispatch-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/dispatch-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF
echo "  [+] Task dispatcher (every 5 min)"

# ── 2. Health Check (every 30 minutes) ──────────────────────────
cat > "$AGENTS_DIR/com.ody.claude.health.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ody.claude.health</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_ROOT/scripts/agents/health-check.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/health-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/health-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF
echo "  [+] Health check (every 30 min)"

# ── 3. Linear Sync (every 15 minutes) ───────────────────────────
cat > "$AGENTS_DIR/com.ody.claude.linear.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ody.claude.linear</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_ROOT/scripts/agents/linear-sync.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/linear-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/linear-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
        <key>LINEAR_API_KEY</key>
        <string>\${LINEAR_API_KEY}</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF
echo "  [+] Linear sync (every 15 min)"

# ── 4. Morning Brief (daily at 06:00) ───────────────────────────
cat > "$AGENTS_DIR/com.ody.claude.morning.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ody.claude.morning</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_ROOT/scripts/agents/morning-brief.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/morning-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/morning-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF
echo "  [+] Morning brief (daily 06:00)"

echo ""
echo "Installation complete. To activate agents:"
echo ""
echo "  # Load all agents:"
echo "  launchctl load ~/Library/LaunchAgents/com.ody.claude.dispatch.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.ody.claude.health.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.ody.claude.linear.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.ody.claude.morning.plist"
echo ""
echo "  # Or load all at once:"
echo "  for f in ~/Library/LaunchAgents/com.ody.claude.*.plist; do launchctl load \"\$f\"; done"
echo ""
echo "  # Check status:"
echo "  launchctl list | grep com.ody.claude"
echo ""
echo "  # For persistent tmux agent (recommended for development):"
echo "  ./scripts/agents/start-tmux.sh"
echo ""
echo "NOTE: For Linear sync, set LINEAR_API_KEY in the plist or export it."
echo "      Edit: ~/Library/LaunchAgents/com.ody.claude.linear.plist"

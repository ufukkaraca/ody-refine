#!/bin/bash
# Ody Refine Demo — run this to see the product in action
# Usage: bash examples/demo.sh (from repo root)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$REPO_ROOT/apps/refine/dist/cli.js"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          Ody Refine — Live Demo                 ║"
echo "║   Finding contradictions in real docs            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Build
echo "Building..."
cd "$REPO_ROOT"
pnpm --filter @useody/platform-core --filter @useody/detectors --filter @useody/export --filter ody-refine build 2>&1 | tail -1

# Clean + copy sample docs
rm -rf /tmp/ody-demo/.ody-refine 2>/dev/null
mkdir -p /tmp/ody-demo
cp "$REPO_ROOT/examples/sample-docs/"*.md /tmp/ody-demo/

echo ""
echo "━━━ Scanning 6 sample company docs... ━━━"
echo ""

# Run on sample docs
cd /tmp/ody-demo
node "$CLI" ingest --no-llm --no-validate .

echo ""
echo "━━━ Opening HTML report... ━━━"
open /tmp/ody-demo/.ody-refine/report.html 2>/dev/null || echo "Report at: /tmp/ody-demo/.ody-refine/report.html"

echo ""
echo "━━━ Demo Complete ━━━"
echo ""
echo "What it found:"
echo "  ✖ Rate limit: 500/min vs 1000/min (two different docs)"
echo "  ✖ PTO: 20 days vs 15 days (handbook vs HR policy)"
echo "  ✖ Remote-first vs office-required (handbook vs policy)"
echo "  ✖ Expense limit: \$50 vs \$25 (onboarding vs policy)"
echo ""
echo "Try it on your own docs:"
echo "  node $CLI ingest <your-docs-directory>"
echo ""

#!/bin/bash
# Ody Refine Demo — run this to see the product in action
# Usage: bash examples/demo.sh

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          Ody Refine — Live Demo                 ║"
echo "║   Finding contradictions in real docs            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Build
echo "Building..."
pnpm --filter @useody/platform-core --filter @useody/detectors --filter @useody/export --filter ody-refine build 2>&1 | tail -1

# Clean
rm -rf /tmp/ody-demo/.ody-refine 2>/dev/null
mkdir -p /tmp/ody-demo
cp examples/sample-docs/*.md /tmp/ody-demo/

echo ""
echo "━━━ Demo 1: Sample Company Docs (6 files) ━━━"
echo ""

# Run on sample docs
cd /tmp/ody-demo
node "$(dirname "$0")/../apps/refine/dist/cli.js" ingest --no-llm --no-validate .

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
echo "  node apps/refine/dist/cli.js ingest <your-docs-directory>"
echo ""

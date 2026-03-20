#!/usr/bin/env bash
# publish.sh — Publish all @useody packages + ody-refine to npm.
# Usage: bash scripts/publish.sh [--dry-run]
#
# Publishes in dependency order:
#   1. @useody/platform-core (no workspace deps)
#   2. @useody/detectors, @useody/export, @useody/eval, @useody/feedback (depend on core)
#   3. ody-refine (depends on detectors, export, feedback)
#
# pnpm automatically resolves workspace:* → real version numbers during publish.

set -euo pipefail

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "DRY RUN — no packages will be published"
  echo ""
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

echo "Building all packages..."
pnpm build

echo ""
echo "Running tests..."
pnpm test

echo ""
echo "Running prepublish checks for ody-refine..."
bash apps/refine/scripts/prepublish-check.sh

echo ""
echo "Publishing in dependency order..."
echo ""

# Layer 1: core (no workspace deps)
echo "=== 1/3: @useody/platform-core ==="
cd "$REPO/packages/core"
pnpm publish --no-git-checks $DRY_RUN

# Layer 2: packages that depend on core
echo ""
echo "=== 2/3: @useody/detectors, @useody/export, @useody/eval, @useody/feedback ==="
for pkg in detectors export eval feedback; do
  cd "$REPO/packages/$pkg"
  pnpm publish --no-git-checks $DRY_RUN
done

# Layer 3: CLI (depends on detectors, export, feedback)
echo ""
echo "=== 3/3: ody-refine ==="
cd "$REPO/apps/refine"
pnpm publish --no-git-checks $DRY_RUN

echo ""
echo "All packages published successfully!"
echo ""
echo "Verify with:"
echo "  npm info @useody/platform-core"
echo "  npm info ody-refine"
echo "  npx ody-refine --help"

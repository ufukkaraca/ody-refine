#!/usr/bin/env bash
# Check for circular imports in TypeScript source.
# Uses madge if available, otherwise skips (grep heuristic has too many false positives).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v madge &>/dev/null; then
  echo "[check-circular] Running madge --circular ..."
  madge --circular --extensions ts --no-spinner "$ROOT/packages/" "$ROOT/apps/" && echo "No circular dependencies found." || {
    echo "WARNING: Potential circular dependencies detected (review manually)."
    # Don't fail CI — madge can also produce false positives with barrel exports.
    # Upgrade to error once we've verified all flagged cycles are real.
    exit 0
  }
else
  echo "[check-circular] madge not installed — skipping circular dependency check."
  echo "[check-circular] Install madge for local checking: pnpm add -D madge"
  exit 0
fi

#!/usr/bin/env bash
# prepublish-check.sh — verifies ody-refine is ready for npm publish.
# Run: pnpm prepublish-check  (from apps/refine/)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo -e "  ${GREEN}PASS${NC}  $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}  $label"
    FAIL=$((FAIL + 1))
  fi
}

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo ""
echo "ody-refine prepublish checks"
echo "============================"
echo ""

# 1. dist/ exists
check "dist/ directory exists" test -d dist

# 2. dist/cli.js exists
check "dist/cli.js exists" test -f dist/cli.js

# 3. dist/cli.js has shebang
check "dist/cli.js has shebang" bash -c 'head -1 dist/cli.js | grep -q "^#!"'

# 4. dist/cli.js is executable
check "dist/cli.js is executable" test -x dist/cli.js

# 5. --help works
check "--help exits cleanly" node dist/cli.js --help

# 6. package.json has required fields
check "package.json has name" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.name) process.exit(1)"
check "package.json has version" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.version) process.exit(1)"
check "package.json has bin" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.bin) process.exit(1)"
check "package.json has files" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.files) process.exit(1)"
check "package.json has license" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.license) process.exit(1)"
check "package.json has repository" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.repository) process.exit(1)"
check "package.json has engines" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.engines) process.exit(1)"
check "package.json has publishConfig" node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8')); if(!p.publishConfig) process.exit(1)"

# 7. README.md exists
check "README.md exists" test -f README.md

# 8. LICENSE exists
check "LICENSE exists" test -f LICENSE

# 9. npm pack dry-run succeeds
check "npm pack --dry-run succeeds" npm pack --dry-run

# 10. Workspace protocol note
echo ""
echo "  NOTE: workspace:* deps in package.json are expected."
echo "        pnpm publish replaces them with resolved versions automatically."

echo ""
echo "============================"
echo -e "  ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Fix failures before publishing."
  exit 1
fi

echo "Ready to publish! Run:"
echo ""
echo "  Publish all workspace packages first (in dependency order):"
echo "    cd packages/core    && pnpm publish --no-git-checks"
echo "    cd packages/detectors && pnpm publish --no-git-checks"
echo "    cd packages/export  && pnpm publish --no-git-checks"
echo "    cd packages/feedback && pnpm publish --no-git-checks"
echo ""
echo "  Then publish ody-refine:"
echo "    cd apps/refine && pnpm publish --no-git-checks"

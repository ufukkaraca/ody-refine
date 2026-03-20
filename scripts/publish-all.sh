#!/bin/bash
# Publish all packages to npm in dependency order
# Usage: ./scripts/publish-all.sh YOUR_OTP_CODE

set -e

OTP=$1
if [ -z "$OTP" ]; then
  echo "Usage: ./scripts/publish-all.sh <otp-code>"
  exit 1
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "Publishing 5 packages with OTP $OTP..."

echo "1/5 @useody/platform-core"
cd packages/core && pnpm publish --no-git-checks --access public --otp="$OTP" && cd "$ROOT"

echo "2/5 @useody/detectors"
cd packages/detectors && pnpm publish --no-git-checks --access public --otp="$OTP" && cd "$ROOT"

echo "3/5 @useody/export"
cd packages/export && pnpm publish --no-git-checks --access public --otp="$OTP" && cd "$ROOT"

echo "4/5 @useody/feedback"
cd packages/feedback && pnpm publish --no-git-checks --access public --otp="$OTP" && cd "$ROOT"

echo "5/5 ody-refine"
cd apps/refine && pnpm publish --no-git-checks --access public --otp="$OTP" && cd "$ROOT"

echo "Done! All 5 packages published."
echo "Test with: npx ody-refine@0.0.1 --help"

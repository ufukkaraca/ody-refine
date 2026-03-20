#!/usr/bin/env bash
# lightpanda-fetch.sh — Fast headless browser fetch using LightPanda
# Renders JavaScript and returns page content as markdown (default), HTML, or semantic tree.
#
# Usage:
#   lightpanda-fetch.sh <URL>                        # markdown output (default)
#   lightpanda-fetch.sh <URL> html                   # raw HTML output
#   lightpanda-fetch.sh <URL> markdown                # markdown output
#   lightpanda-fetch.sh <URL> semantic_tree           # accessibility tree (structured)
#   lightpanda-fetch.sh <URL> semantic_tree_text      # accessibility tree (plain text)
#
# Options (via environment variables):
#   STRIP_MODE=js,css,ui    Strip tags (js, css, ui, full)
#   WITH_FRAMES=1           Include iframe contents
#   HTTP_TIMEOUT=15000      HTTP timeout in ms (default: 15000)
#   LOG_LEVEL=error         Log level: debug, info, warn, error, fatal
#
# Examples:
#   ./lightpanda-fetch.sh https://example.com
#   STRIP_MODE=full ./lightpanda-fetch.sh https://example.com
#   ./lightpanda-fetch.sh https://github.com/lightpanda-io/browser semantic_tree_text

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: lightpanda-fetch.sh <URL> [format]" >&2
  echo "" >&2
  echo "Formats: markdown (default), html, semantic_tree, semantic_tree_text" >&2
  exit 1
fi

URL="$1"
FORMAT="${2:-markdown}"

# Validate format
case "$FORMAT" in
  html|markdown|semantic_tree|semantic_tree_text) ;;
  *)
    echo "Error: Invalid format '$FORMAT'" >&2
    echo "Valid formats: html, markdown, semantic_tree, semantic_tree_text" >&2
    exit 1
    ;;
esac

# Check that lightpanda is installed
if ! command -v lightpanda &>/dev/null; then
  echo "Error: lightpanda not found. Install with: brew install lightpanda-io/browser/lightpanda" >&2
  exit 1
fi

# Build command arguments
ARGS=(fetch --dump "$FORMAT")

# Optional: strip mode
if [ -n "${STRIP_MODE:-}" ]; then
  ARGS+=(--strip_mode "$STRIP_MODE")
fi

# Optional: include iframes
if [ "${WITH_FRAMES:-0}" = "1" ]; then
  ARGS+=(--with_frames)
fi

# HTTP timeout (default 15 seconds)
ARGS+=(--http_timeout "${HTTP_TIMEOUT:-15000}")

# Log level (default error to keep output clean)
ARGS+=(--log_level "${LOG_LEVEL:-error}")

# Execute
exec lightpanda "${ARGS[@]}" "$URL"

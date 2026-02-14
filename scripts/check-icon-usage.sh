#!/usr/bin/env bash
set -euo pipefail

# Check for bare FA class usage in TSX files — should use <Icon> component instead.
# Excludes: Icon.tsx itself, generated files, node_modules

VIOLATIONS=$(grep -rn --include='*.tsx' -E 'className="[^"]*fa-(solid|regular|brands) ' \
  src/ design-system/src/ \
  --exclude='Icon.tsx' \
  --exclude='*.generated.*' \
  2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Use <Icon> component instead of bare <i> with FA classes:"
  echo "$VIOLATIONS"
  exit 1
fi

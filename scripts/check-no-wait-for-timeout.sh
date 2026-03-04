#!/usr/bin/env bash
set -euo pipefail

# Ban waitForTimeout in test files — use Playwright assertions/waitFor instead.

VIOLATIONS=$(grep -rn 'waitForTimeout' \
  tests/ src/ design-system/ \
  --include='*.test.*' --include='*.spec.*' --include='*.e2e.*' \
  2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Do not use waitForTimeout in tests — use assertions or waitFor instead:"
  echo "$VIOLATIONS"
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

FAILED=0

step() {
  echo -e "\n${BOLD}▶ $1${RESET}"
}

pass() {
  echo -e "${GREEN}✓ $1 passed${RESET}"
}

fail() {
  echo -e "${RED}✗ $1 failed${RESET}"
  FAILED=1
}

# Icon usage lint
step "Icon usage (no bare FA classes)"
if ./scripts/check-icon-usage.sh 2>&1; then
  pass "Icon usage"
else
  fail "Icon usage"
fi

# Type checking
step "Type checking (tsc --build)"
if bun run typecheck 2>&1; then
  pass "Typecheck"
else
  fail "Typecheck"
fi

# Linting
step "Linting (biome check)"
if bun run lint 2>&1; then
  pass "Lint"
else
  fail "Lint"
fi

# Tests
step "Tests (vitest)"
if bun run test 2>&1; then
  pass "Tests"
else
  fail "Tests"
fi

# Summary
echo ""
if [ "$FAILED" -ne 0 ]; then
  echo -e "${RED}${BOLD}Verification failed.${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}All checks passed.${RESET}"
fi

#!/usr/bin/env bash
# Source this file to load GH_TOKEN from .env.local
# Usage: source .claude/skills/pr-fix-failing-tests/scripts/load-env.sh

fail() {
  echo "Error: $1" >&2
  return 1 2>/dev/null || exit 1
}

# Find repo root by looking for .env.local up the directory tree
find_repo_root() {
  local dir
  dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/.env.local" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

REPO_ROOT=$(find_repo_root)

if [[ -z "$REPO_ROOT" ]]; then
  fail ".env.local not found in any parent directory"
fi

GH_TOKEN=$(grep '^GH_TOKEN=' "$REPO_ROOT/.env.local" | cut -d'=' -f2- | tr -d '\r')
export GH_TOKEN

if [[ -z "$GH_TOKEN" ]]; then
  fail "GH_TOKEN not found in $REPO_ROOT/.env.local"
fi

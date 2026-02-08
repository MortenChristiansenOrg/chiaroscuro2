#!/usr/bin/env bash
# Source this file to load GH_TOKEN from .env.local
# Usage: source .claude/skills/coderabbit-review/scripts/load-env.sh

# Find repo root by looking for .env.local up the directory tree
find_repo_root() {
  local dir="$PWD"
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
  echo "Error: .env.local not found in any parent directory" >&2
  exit 1
fi

GH_TOKEN=$(grep '^GH_TOKEN=' "$REPO_ROOT/.env.local" | cut -d'=' -f2- | tr -d '\r')
export GH_TOKEN

if [[ -z "$GH_TOKEN" ]]; then
  echo "Error: GH_TOKEN not found in $REPO_ROOT/.env.local" >&2
  exit 1
fi

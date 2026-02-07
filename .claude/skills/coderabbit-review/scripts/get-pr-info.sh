#!/usr/bin/env bash
# Get PR info (number, owner, repo) for current branch or specified PR
# Usage: get-pr-info.sh [pr_number]
# Output: JSON with owner, repo, pr fields

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

# Get repo info
REPO_INFO=$(gh repo view --json owner,name -q '"\(.owner.login) \(.name)"')
OWNER=$(echo "$REPO_INFO" | cut -d' ' -f1)
REPO=$(echo "$REPO_INFO" | cut -d' ' -f2)

# Get PR number
if [[ $# -ge 1 ]]; then
  PR_NUMBER="$1"
else
  PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
  if [[ -z "$PR_NUMBER" ]]; then
    echo "Error: No PR found for current branch and no PR number provided" >&2
    exit 1
  fi
fi

echo "{\"owner\": \"$OWNER\", \"repo\": \"$REPO\", \"pr\": $PR_NUMBER}"

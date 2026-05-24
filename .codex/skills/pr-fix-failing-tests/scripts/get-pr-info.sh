#!/usr/bin/env bash
# Get PR info (number, owner, repo) for current branch or specified PR
# Usage: get-pr-info.sh [pr_number]
# Output: JSON with owner, repo, pr fields

set -euo pipefail

# Get repo info
REPO_INFO=$(gh repo view --json owner,name -q '"\(.owner.login) \(.name)"')
OWNER=$(echo "$REPO_INFO" | cut -d' ' -f1)
REPO=$(echo "$REPO_INFO" | cut -d' ' -f2)

# Get PR number
PR_NUMBER=""
if [[ $# -ge 1 ]]; then
  PR_NUMBER="$1"
  if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Error: PR number must be numeric" >&2
    exit 1
  fi
else
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  if [[ -n "$BRANCH" ]]; then
    # Try explicit branch name first (works reliably in worktrees)
    PR_NUMBER=$(gh pr view "$BRANCH" --json number -q '.number' 2>/dev/null || echo "")
    # Fallback: list PRs by head branch
    if [[ -z "$PR_NUMBER" ]]; then
      PR_NUMBER=$(gh pr list --head "$BRANCH" --json number -q '.[0].number' 2>/dev/null || echo "")
    fi
  fi
  if [[ -z "$PR_NUMBER" ]]; then
    echo "Error: No PR found for current branch ($BRANCH) and no PR number provided" >&2
    exit 1
  fi
fi

echo "{\"owner\": \"$OWNER\", \"repo\": \"$REPO\", \"pr\": $PR_NUMBER}"

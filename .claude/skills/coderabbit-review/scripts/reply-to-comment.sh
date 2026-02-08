#!/usr/bin/env bash
# Reply to a PR review comment (use to teach CodeRabbit)
# Usage: reply-to-comment.sh <owner> <repo> <pr_number> <comment_id> <body>

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

if [[ $# -lt 5 ]]; then
  echo "Usage: $0 <owner> <repo> <pr_number> <comment_id> <body>" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
PR_NUMBER="$3"
COMMENT_ID="$4"
BODY="$5"

gh api \
  --method POST \
  "/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/comments/${COMMENT_ID}/replies" \
  -f body="$BODY" \
  --jq '"Reply posted: \(.html_url)"'

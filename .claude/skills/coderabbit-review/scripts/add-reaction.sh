#!/usr/bin/env bash
# Add reaction to a PR review comment
# Usage: add-reaction.sh <owner> <repo> <comment_id> <reaction>
# Reactions: +1, -1, laugh, confused, heart, hooray, rocket, eyes

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <owner> <repo> <comment_id> <reaction>" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
COMMENT_ID="$3"
REACTION="$4"

gh api \
  --method POST \
  "/repos/${OWNER}/${REPO}/pulls/comments/${COMMENT_ID}/reactions" \
  -f content="$REACTION" \
  --jq '"Reaction added: \(.content)"'

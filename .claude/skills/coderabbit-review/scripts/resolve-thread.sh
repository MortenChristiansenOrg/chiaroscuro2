#!/usr/bin/env bash
# Resolve a review thread (requires OAuth token, not fine-grained PAT)
# Usage: resolve-thread.sh <thread_id>

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <thread_id>" >&2
  exit 1
fi

THREAD_ID="$1"

gh api graphql \
  -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread { id isResolved }
      }
    }' \
  -F threadId="$THREAD_ID" \
  --jq '.data.resolveReviewThread.thread | "Resolved: \(.id)"'

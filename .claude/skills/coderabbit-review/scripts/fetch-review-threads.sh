#!/usr/bin/env bash
# Fetch all unresolved CodeRabbit review threads for a PR
# Usage: fetch-review-threads.sh <owner> <repo> <pr_number>
# Output: JSON array with threadId, commentId, path, line, body

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <owner> <repo> <pr_number>" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
PR_NUMBER="$3"

gh api graphql \
  -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              comments(first: 1) {
                nodes {
                  id
                  databaseId
                  body
                  author { login }
                }
              }
            }
          }
        }
      }
    }' \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F pr="$PR_NUMBER" \
  --jq '
    .data.repository.pullRequest.reviewThreads.nodes
    | map(select(.isResolved == false))
    | map({
        threadId: .id,
        commentId: .comments.nodes[0].databaseId,
        nodeId: .comments.nodes[0].id,
        path: .path,
        line: .line,
        isOutdated: .isOutdated,
        author: .comments.nodes[0].author.login,
        body: .comments.nodes[0].body
      })
    | map(select(.author == "coderabbitai"))
  '

#!/usr/bin/env bash
# Fetch failed CI jobs for a PR
# Usage: fetch-failed-jobs.sh <owner> <repo> <pr_number>
# Output: JSON array of failed jobs with name, jobId, detailsUrl

set -euo pipefail

OWNER="$1"
REPO="$2"
PR="$3"

# Get check rollup, filter to failures, extract job info
gh pr view "$PR" -R "$OWNER/$REPO" --json statusCheckRollup -q '
  [.statusCheckRollup[]
   | select(.conclusion == "FAILURE")
   | {
       name: .name,
       detailsUrl: .detailsUrl,
       jobId: (.detailsUrl | capture("/job/(?<id>[0-9]+)") | .id // null)
     }
  ]'

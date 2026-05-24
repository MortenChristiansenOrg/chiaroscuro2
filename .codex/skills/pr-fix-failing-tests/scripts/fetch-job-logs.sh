#!/usr/bin/env bash
# Fetch logs for a specific CI job
# Usage: fetch-job-logs.sh <owner> <repo> <job_id> [tail_lines]
# Output: Job log text (last N lines, default 200)

set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: fetch-job-logs.sh <owner> <repo> <job_id> [tail_lines]" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
JOB_ID="$3"
TAIL_LINES="${4:-200}"

if ! [[ "$TAIL_LINES" =~ ^[0-9]+$ ]]; then
  echo "Error: tail_lines must be a non-negative integer" >&2
  exit 1
fi

gh api "repos/$OWNER/$REPO/actions/jobs/$JOB_ID/logs" | tail -"$TAIL_LINES"

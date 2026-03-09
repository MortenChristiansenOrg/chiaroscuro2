#!/usr/bin/env bash
# Fetch logs for a specific CI job
# Usage: fetch-job-logs.sh <owner> <repo> <job_id> [tail_lines]
# Output: Job log text (last N lines, default 200)

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

OWNER="$1"
REPO="$2"
JOB_ID="$3"
TAIL_LINES="${4:-200}"

gh api "repos/$OWNER/$REPO/actions/jobs/$JOB_ID/logs" 2>/dev/null | tail -"$TAIL_LINES"

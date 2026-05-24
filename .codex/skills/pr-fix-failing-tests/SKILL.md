---
name: pr-fix-failing-tests
description: Check PR for failing CI pipelines, fetch logs, analyze errors, and fix them. Use with /pr-fix-failing-tests or /pr-fix-failing-tests <PR_NUMBER>.
invocation: user
---

# Goal

Identify failing CI test jobs on a PR, fetch their logs, analyze the failures, and fix the underlying issues.

## Invocation

- `/pr-fix-failing-tests` - Uses current branch's PR
- `/pr-fix-failing-tests <PR_NUMBER>` - Specific PR

## Prerequisites

Requires `gh` CLI authenticated with access to the repository (PR read + Actions read).

## Workflow

### 1. Get PR Info

```bash
# Returns {"owner": "...", "repo": "...", "pr": N}
.claude/skills/pr-fix-failing-tests/scripts/get-pr-info.sh [pr_number]
```

### 2. Fetch Failed Jobs

```bash
# Returns JSON array of failed jobs with name, jobId, detailsUrl
.claude/skills/pr-fix-failing-tests/scripts/fetch-failed-jobs.sh <owner> <repo> <pr>
```

If no failed jobs, report success and exit.

### 3. Fetch Job Logs

For each failed job:

```bash
# Returns last N lines of job log (default 200)
.claude/skills/pr-fix-failing-tests/scripts/fetch-job-logs.sh <owner> <repo> <job_id> [tail_lines]
```

### 4. Analyze Failures

Common failure patterns:

| Pattern | Likely Cause |
|---------|--------------|
| `Test timeout` | Element not found, slow CI, race condition |
| `locator.waitFor` | Missing testid, element not rendered |
| `Expected X but received Y` | Logic error, assertion failure |
| `Cannot find module` | Missing import, build issue |
| `Type error` | TypeScript issue |

For each failure, identify:
- Test file and line number
- The specific assertion or action that failed
- Error message and call stack
- Whether it's a test issue or app code issue

### 5. Apply Fixes

Based on analysis:

1. **Test issues** - Fix selectors, add waits, update assertions
2. **App issues** - Fix the underlying component/logic
3. **CI environment issues** - Increase timeouts, add retries, fix env vars

Group related fixes into logical commits.

### 6. Verify Locally

Before pushing, repro the failing tests locally, then run the full verification suite:

```bash
bun run e2e  # or specific test file
bun run verify
```

### 7. Commit and Push

Commit fixes with descriptive messages:

```bash
git add <files>
git commit -m "Fix: <description of fix>"
```

Ask user to push (token may not have write access):

```bash
git push
```

## Scripts

| Script | Purpose | Args |
|--------|---------|------|
| `get-pr-info.sh` | Get owner/repo/pr | `[pr_number]` |
| `fetch-failed-jobs.sh` | Get failed CI jobs | `<owner> <repo> <pr>` |
| `fetch-job-logs.sh` | Get job log output | `<owner> <repo> <job_id> [tail_lines]` |

All scripts rely on `gh` CLI authentication.

## Output Format

```markdown
# CI Fix Report: PR #XXX

## Failed Jobs

| Job | Status | Job ID |
|-----|--------|--------|
| e2e | FAILURE | 123456 |

## Failures Analyzed

### [job-name] - test-file:line
**Error:** Brief error description
**Cause:** Root cause analysis
**Fix:** What was changed

## Commits Made

- abc1234: Fix description

## Verification

- [ ] Tests pass locally
- [ ] Ready to push

## Next Steps

User to run `git push` to trigger CI re-run.
```

## Error Handling

- If `gh` not authenticated: prompt user to run `gh auth login`
- If PR not found: show error with branch name
- If no failed checks: report success and exit
- If logs unavailable: note and continue with available info

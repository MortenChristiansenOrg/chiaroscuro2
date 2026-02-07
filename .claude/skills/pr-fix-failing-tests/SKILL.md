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

Requires `gh` CLI with a token that has PR read access.

**Setup:** Add fine-grained PAT to `.env.local`:
1. Create token at <https://github.com/settings/personal-access-tokens/new>
2. Select repository access
3. Permissions: **Pull requests → Read**, **Actions → Read**
4. Add to `.env.local`: `GH_TOKEN=ghp_xxx`
5. Verify `.env.local` is in `.gitignore` to prevent token exposure

## Workflow

### 0. Load Environment

Export `GH_TOKEN` from `.env.local` for `gh` CLI:

```bash
[[ -f .env.local ]] && set -a && source <(grep '^GH_TOKEN=' .env.local) && set +a
```

Run this before any `gh` commands.

### 1. Identify PR

If no PR number provided, get from current branch:

```bash
gh pr view --json number -q '.number'
```

Get repo info:

```bash
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'
```

### 2. Get PR Check Status

Fetch all checks for the PR:

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup
```

Filter for failed checks (`conclusion: "FAILURE"`). Each check has:
- `name` - job name (e.g., "e2e", "checks", "lint")
- `detailsUrl` - contains run ID and job ID
- `conclusion` - "SUCCESS", "FAILURE", etc.

### 3. Extract Job Info from detailsUrl

Parse the `detailsUrl` to get job ID:
- Format: `https://github.com/<owner>/<repo>/actions/runs/<run_id>/job/<job_id>`
- Extract `<job_id>` from the URL

### 4. Fetch Job Logs

For each failed job:

```bash
gh api repos/<owner>/<repo>/actions/jobs/<job_id>/logs
```

This returns the full log output. Use `tail -200` or similar to get the relevant failure section.

### 5. Analyze Failures

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

### 6. Apply Fixes

Based on analysis:

1. **Test issues** - Fix selectors, add waits, update assertions
2. **App issues** - Fix the underlying component/logic
3. **CI environment issues** - Increase timeouts, add retries, fix env vars

Group related fixes into logical commits.

### 7. Verify Locally

Before pushing, run the failing tests locally:

```bash
bun run e2e  # or specific test file
```

### 8. Commit and Push

Commit fixes with descriptive messages:

```bash
git add <files>
git commit -m "Fix: <description of fix>"
```

Ask user to push (token may not have write access):

```bash
git push
```

## Output Format

```markdown
# CI Fix Report: PR #XXX

## Failed Jobs

| Job | Status | Run ID |
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

- If `gh` not authenticated: prompt to check `.env.local` or run `gh auth login`
- If PR not found: show error with branch name
- If no failed checks: report success and exit
- If logs unavailable: note and continue with available info

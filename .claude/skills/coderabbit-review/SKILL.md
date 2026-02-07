---
name: coderabbit-review
description: Handle CodeRabbit PR review comments - triage, fix, commit, resolve threads. Use with /coderabbit-review or /coderabbit-review <PR_NUMBER>.
invocation: user
---

# Goal

Process CodeRabbit review comments on a PR: fetch comments, triage, apply fixes, commit, and mark resolved.

## Workflow

### 1. Get PR Info

```bash
# Returns {"owner": "...", "repo": "...", "pr": N}
.claude/skills/coderabbit-review/scripts/get-pr-info.sh [pr_number]
```

### 2. Fetch Review Threads

```bash
.claude/skills/coderabbit-review/scripts/fetch-review-threads.sh <owner> <repo> <pr>
```

Returns JSON array of unresolved CodeRabbit threads with: `threadId`, `commentId`, `path`, `line`, `body`, `isOutdated`.

### 3. Triage by Priority

| Marker                     | Priority | Action              |
| -------------------------- | -------- | ------------------- |
| `**Security**` / `**Bug**` | High     | Must address        |
| `**Suggestion**`           | Medium   | Evaluate merit      |
| `**Nitpick**`              | Low      | Auto-fix if trivial |

**Wrong/irrelevant comments:** Reply with explanation then resolve:

```bash
.claude/skills/coderabbit-review/scripts/reply-to-comment.sh <owner> <repo> <pr> <comment_id> "@coderabbitai <explanation>"
```

### 4. Apply Fixes

- One commit per major fix
- Group small changes together
- Use sub-agents for parallel work

### 5. Push & Mark

After user pushes, add reactions:

```bash
# Fixed: rocket
.claude/skills/coderabbit-review/scripts/add-reaction.sh <owner> <repo> <comment_id> rocket

# Skipped: -1
.claude/skills/coderabbit-review/scripts/add-reaction.sh <owner> <repo> <comment_id> -1
```

## Scripts

| Script                    | Purpose               | Args                                      |
| ------------------------- | --------------------- | ----------------------------------------- |
| `get-pr-info.sh`          | Get owner/repo/pr     | `[pr_number]`                             |
| `fetch-review-threads.sh` | Get unresolved threads | `<owner> <repo> <pr>`                     |
| `reply-to-comment.sh`     | Reply to comment      | `<owner> <repo> <pr> <comment_id> <body>` |
| `add-reaction.sh`         | Add reaction          | `<owner> <repo> <comment_id> <reaction>`  |
| `resolve-thread.sh`       | Resolve thread        | `<thread_id>`                             |

All scripts auto-load `GH_TOKEN` from `.env.local`.

## Output Format

```markdown
# CodeRabbit Review: PR #XXX

## Summary
X comments: Y high, Z medium, W low

## Fixed
- [file:line] Description

## Skipped
- [file:line] Reason

## Commits
- abc1234: Message

## Next
User to run `git push`
```

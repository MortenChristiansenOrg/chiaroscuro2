# Automated Bug-Fix Workflow

Automatically turn GitHub issues into fix PRs using Claude Code.

## Overview

```
Issue opened → (optional triage) → Claude reads issue → creates branch → writes fix + tests → opens PR
```

Three implementation options, simplest to most flexible:

1. **Claude Code GitHub Action** — turnkey, GitHub-native
2. **Claude CLI in GitHub Actions** — more control, same CI environment
3. **Agent SDK** — full programmatic orchestration (Python/TS)

---

## Option 1: Claude Code GitHub Action

`anthropics/claude-code-action@v1` — official action with built-in GitHub integration.

### What it does automatically

- Reads issue/PR context from GitHub API
- Creates branches (configurable naming: `claude/issue-123-fix-auth`)
- Commits code changes
- Opens PRs linking to the original issue
- Posts comments on issues/PRs

### Minimal setup

```bash
# Interactive setup (installs GitHub app + configures secrets)
claude
/install-github-app
```

Or manually:
1. Install app: https://github.com/apps/claude
2. Add `ANTHROPIC_API_KEY` to repo secrets
3. Add workflow file below

### Simple one-step workflow

```yaml
# .github/workflows/claude-fix-bug.yml
name: Claude Auto-Fix

on:
  issues:
    types: [opened, labeled]

jobs:
  fix:
    if: contains(github.event.issue.labels.*.name, 'auto-fix')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Read issue #${{ github.event.issue.number }}: ${{ github.event.issue.title }}

            1. Locate the relevant code
            2. Write a failing test reproducing the bug
            3. Fix the bug with minimal changes
            4. Verify all tests pass
            5. Create a PR referencing the issue
          claude_args: "--max-turns 10 --model claude-opus-4-6"
```

### Two-phase workflow (triage → fix)

Prevents wasted work on ambiguous issues. Claude first comments with a plan, then waits for approval.

```yaml
# Phase 1: Triage (runs on issue creation)
name: Claude Triage

on:
  issues:
    types: [opened]

jobs:
  triage:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Analyze issue #${{ github.event.issue.number }}.
            1. Classify: bug / feature / question / docs
            2. Assess priority and complexity
            3. Identify likely root cause and affected files
            4. Post a comment with your analysis and proposed fix approach
            5. Add labels: priority/*, type/*, and 'auto-fixable' if confident
          claude_args: "--max-turns 5"
```

```yaml
# Phase 2: Fix (runs when 'auto-fix' label added — manually by maintainer after reviewing triage)
name: Claude Fix

on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'auto-fix'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Fix issue #${{ github.event.issue.number }}.
            Read the triage comment for context.
            Create a branch, implement the fix, add tests, open a PR.
          claude_args: "--max-turns 10 --model claude-opus-4-6"
```

### @claude mention pattern

Lets anyone with repo access request fixes interactively in issue/PR comments.

```yaml
name: Claude Respond

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  respond:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # No prompt needed — auto-reads the @claude mention context
```

### Key action parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `prompt` | Instructions (optional for @claude mentions) | `"Fix the bug..."` |
| `claude_args` | CLI flags | `"--max-turns 10 --model claude-opus-4-6"` |
| `trigger_phrase` | Comment trigger word | `@claude` (default) |
| `label_trigger` | Label that activates | `claude` (default) |
| `branch_prefix` | Branch naming prefix | `claude/` (default) |
| `track_progress` | Show progress checkboxes | `true` / `false` |
| `settings` | Claude Code settings JSON | `'{"permissions":...}'` |
| `allowed_bots` | Bot usernames that can trigger | `"dependabot,renovate"` |

---

## Option 2: Claude CLI in GitHub Actions

More control — useful when you need custom environment setup (e.g., running the Electron app, database fixtures, specific Node version).

```yaml
name: Claude CLI Fix

on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'auto-fix'
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Create fix
        run: |
          ISSUE_NUM=${{ github.event.issue.number }}
          ISSUE_TITLE="${{ github.event.issue.title }}"

          git checkout -b claude/fix-issue-${ISSUE_NUM}

          claude -p "
            Fix GitHub issue #${ISSUE_NUM}: ${ISSUE_TITLE}

            1. Read the issue via gh CLI for full context
            2. Reproduce with a failing test
            3. Fix the bug
            4. Run 'npm test' to verify
            5. Stage and commit changes
          " --allowedTools "Read,Edit,Bash,Glob,Grep" \
            --max-turns 10 \
            --model claude-opus-4-6

          git push -u origin HEAD

          gh pr create \
            --title "fix: ${ISSUE_TITLE}" \
            --body "Fixes #${ISSUE_NUM}" \
            --base main
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### When to prefer CLI over the action

- Need custom toolchain (bun, specific runtimes, system deps)
- Need to run the app under test (Electron, dev servers)
- Want to capture structured output (`--output-format json`)
- Multi-step orchestration with shell logic between Claude invocations
- Using outside GitHub (GitLab CI, Jenkins, etc.)

---

## Option 3: Agent SDK

For complex multi-agent orchestration. Overkill for simple bug fixes, useful when you need:

- Multiple Claude agents collaborating (reproducer agent → fixer agent → reviewer agent)
- Custom tool implementations beyond Bash/Read/Edit
- Programmatic control flow with retries, branching logic
- Integration with non-GitHub systems

Available as Python (`anthropic`) and TypeScript (`@anthropic-ai/claude-agent-sdk`) packages.

---

## Cost & Safety Controls

### Guarding against runaway costs

| Control | How |
|---------|-----|
| Label gate | Only trigger on `auto-fix` label, not every issue |
| Max turns | `--max-turns 5-10` caps API round-trips |
| Workflow timeout | `timeout-minutes: 30` on the job |
| Allowed tools | Restrict to `Read,Edit,Bash(npm test*)` — no arbitrary commands |
| API spend limit | Set on Anthropic dashboard per API key |
| Model choice | Use Sonnet for triage, Opus for fixes |

### Guarding against bad fixes

| Control | How |
|---------|-----|
| Draft PRs | Action creates regular PRs — make branch protection require review |
| CI must pass | Branch protection: require status checks before merge |
| Two-phase | Triage first, human approves before fix attempt |
| Test requirement | Prompt instructs Claude to add tests; CI enforces coverage |
| Scope limit | `paths:` filter to only trigger for certain directories |

### Example: restricted tool access

```yaml
claude_args: >-
  --max-turns 8
  --allowedTools "Read,Edit,Glob,Grep,Bash(bun test*),Bash(bun run lint*),Bash(git *)"
```

This allows reading/editing files and running tests/lint/git, but blocks arbitrary shell commands.

---

## Practical Considerations

### Issue template for best results

```markdown
<!-- .github/ISSUE_TEMPLATE/bug_report.md -->
## Bug Description
<!-- What's broken? -->

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
<!-- What should happen? -->

## Actual Behavior
<!-- What happens instead? -->

## Relevant Files
<!-- Which files/components are likely involved? -->
```

Structured templates dramatically improve Claude's success rate.

### What works well

- Clear bugs with reproducible steps
- Type errors, lint violations, test failures
- Missing null checks, off-by-one errors
- API contract mismatches
- Dependency updates / security patches

### What doesn't work well (yet)

- Vague reports ("app is slow", "feels broken")
- UI/visual bugs (no browser access in CI — unless using self-hosted runner with display)
- Complex multi-system integration bugs
- Bugs requiring production data to reproduce

### Self-hosted runner for Electron/UI bugs

For this project specifically, a self-hosted runner with display access could:
1. Launch the Electron app
2. Use Playwright to reproduce visual bugs
3. Take screenshots for verification
4. Fix and verify visually

This requires WSL2/Windows runner setup similar to the existing dev environment.

---

## Recommended Starting Point

1. Start with the **@claude mention pattern** — zero commitment, just lets you say `@claude fix this` on any issue
2. Add the **two-phase workflow** once you trust the triage quality
3. Use `auto-fix` label gating so humans stay in the loop
4. Set `--max-turns 10` and `timeout-minutes: 30` as safety nets
5. Require PR review + CI pass before merge (branch protection)

---

## References

- [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action)
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Code GitHub Actions Docs](https://code.claude.com/docs/en/github-actions)

#!/usr/bin/env bash
# Fetch all unresolved CodeRabbit review threads AND review-body comments for a PR
# Usage: fetch-review-threads.sh <owner> <repo> <pr_number>
# Output: JSON array with threadId/reviewId, commentId, path, line, body, source

set -euo pipefail


if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <owner> <repo> <pr_number>" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
PR_NUMBER="$3"

# 1. Fetch unresolved inline review threads (existing behavior)
THREADS=$(gh api graphql \
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
        source: "thread",
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
  ')

# 2. Fetch review-body comments (outside diff range + nitpick sections)
# These are embedded in the review body markdown and have no thread/resolved state.
# We only look at the LATEST CodeRabbit review to avoid duplicates from repeated reviews.
_review_body_stderr=$(mktemp)
REVIEW_BODY_COMMENTS=$(gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" --paginate | jq -s 'add' | python3 -c '
import json, re, sys

reviews = json.load(sys.stdin)
cr_reviews = [r for r in reviews if r["user"]["login"] == "coderabbitai[bot]" and r.get("body", "").strip()]
if not cr_reviews:
    print("[]")
    sys.exit(0)

review = cr_reviews[-1]
review_id = review["id"]
body = review["body"]

# Strip blockquote > prefixes
body = re.sub(r"^> ?", "", body, flags=re.MULTILINE)

comments = []

def extract_blockquote_content(text, start_pos):
    """Extract content between <blockquote> and its matching </blockquote>."""
    depth = 0
    i = start_pos
    content_start = None
    while i < len(text):
        if text[i:].startswith("<blockquote>"):
            if depth == 0:
                content_start = i + len("<blockquote>")
            depth += 1
            i += len("<blockquote>")
        elif text[i:].startswith("</blockquote>"):
            depth -= 1
            if depth == 0:
                return text[content_start:i]
            i += len("</blockquote>")
        else:
            i += 1
    return ""

# Find "Outside diff range comments" and "Nitpick comments" sections
for m in re.finditer(r"<summary>(?:⚠️ Outside diff range comments|🧹 Nitpick comments)[^<]*</summary>", body):
    section_content = extract_blockquote_content(body, m.end())
    if not section_content:
        continue

    # Find file-level blocks: <summary>FILE (N)</summary><blockquote>...</blockquote>
    for fm in re.finditer(r"<summary>\s*(.*?)\s*\(\d+\)\s*</summary>", section_content):
        file_path = fm.group(1).strip()
        file_content = extract_blockquote_content(section_content, fm.end())
        if not file_content:
            continue

        # Split into individual comments, each starting with `LINE_RANGE`:
        comment_blocks = re.split(r"(?m)(?=^`\d)", file_content)
        for block in comment_blocks:
            block = block.strip()
            if not block:
                continue

            # Parse: `LINE`: _MARKER_ | _SEVERITY_\n**TITLE**\nBODY
            m2 = re.match(
                r"`([^`]+)`:\s*_([^_]+)_\s*\|\s*_([^_]+)_\s*\n+\*\*(.+?)\*\*\s*\n+(.*)",
                block,
                re.DOTALL
            )
            if not m2:
                # Try without marker/severity (some nitpicks lack them)
                m3 = re.match(r"`([^`]+)`:\s*\*\*(.+?)\*\*\s*\n+(.*)", block, re.DOTALL)
                if m3:
                    line_range, title, comment_body = m3.groups()
                    marker, severity = "unknown", "unknown"
                else:
                    continue
            else:
                line_range, marker, severity, title, comment_body = m2.groups()

            # Clean trailing HTML tags
            comment_body = re.sub(r"\s*</?(details|blockquote)>\s*$", "", comment_body).strip()

            # Extract first line number
            line_num = re.match(r"(\d+)", line_range)
            line = int(line_num.group(1)) if line_num else None

            comments.append({
                "source": "review_body",
                "reviewId": review_id,
                "path": file_path,
                "line": line,
                "lineRange": line_range,
                "marker": marker.strip(),
                "severity": severity.strip(),
                "title": title.strip(),
                "body": comment_body,
                "isOutdated": False
            })

print(json.dumps(comments))
' 2>"$_review_body_stderr" || { echo "Warning: review-body fetch failed:" >&2; cat "$_review_body_stderr" >&2; echo '[]'; })
rm -f "$_review_body_stderr"

# 3. Merge both arrays
jq -n --argjson a "$THREADS" --argjson b "$REVIEW_BODY_COMMENTS" '$a + $b'

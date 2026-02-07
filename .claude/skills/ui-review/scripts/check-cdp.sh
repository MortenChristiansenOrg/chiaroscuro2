#!/usr/bin/env bash
# Check if CDP endpoint is reachable and list available pages.
# Usage: ./check-cdp.sh
set -e

PORT="${CHIAROSCURO_DEBUG_PORT:-9222}"
URL="http://127.0.0.1:$PORT"

echo "Checking CDP at $URL..."

if ! curl -s "$URL/json/version" >/dev/null 2>&1; then
  echo "CDP not reachable at $URL."
  echo ""
  echo "To start the app with debugging:"
  echo "  .claude/skills/ui-review/scripts/launch-app.sh"
  echo ""
  echo "Or manually from Windows:"
  echo "  npx electron . --remote-debugging-port=$PORT"
  exit 1
fi

echo "CDP is active."
echo ""
echo "Browser version:"
curl -s "$URL/json/version" | python3 -m json.tool 2>/dev/null
echo ""
echo "Open pages:"
curl -s "$URL/json/list" | python3 -c "
import sys, json
pages = json.load(sys.stdin)
for i, p in enumerate(pages):
    print(f'  [{i}] {p[\"type\"]}: {p[\"title\"]} — {p[\"url\"]}')
" 2>/dev/null || curl -s "$URL/json/list"

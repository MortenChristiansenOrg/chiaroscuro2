#!/usr/bin/env bash
# Connect playwright-cli to a running Electron app via CDP without navigating any page.
#
# Usage: connect-app.sh [--cdp-port PORT]
#   --cdp-port PORT   CDP port (default: ELECTRON_APP_PORT from .env.local)
set -e -o pipefail

CDP_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Read from .env.local if --cdp-port not provided
if [ -z "$CDP_PORT" ]; then
  SCRIPT_DIR_ENV="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_DIR_ENV="$(cd "$SCRIPT_DIR_ENV/../../../.." && pwd)"
  if [ -f "$PROJECT_DIR_ENV/.env.local" ]; then
    CDP_PORT=$(grep -oP '^ELECTRON_APP_PORT=\K.*' "$PROJECT_DIR_ENV/.env.local" | tr -d '[:space:]')
  fi
  if [ -z "$CDP_PORT" ]; then
    echo "Error: ELECTRON_APP_PORT not set in .env.local and no --cdp-port flag provided."
    echo "Add ELECTRON_APP_PORT=<port> to $PROJECT_DIR_ENV/.env.local"
    exit 1
  fi
fi

CDP_URL="http://127.0.0.1:$CDP_PORT"

# --- Version check (local only, no network) ---
INSTALLED_VERSION=$(playwright-cli --version 2>/dev/null | grep -oP '[\d.]+' | head -1) || true
if [ -z "$INSTALLED_VERSION" ]; then
  echo "Error: playwright-cli not found on PATH"
  exit 1
fi
echo "playwright-cli version: $INSTALLED_VERSION"

# --- Verify CDP endpoint ---
echo -n "Checking CDP at $CDP_URL..."
if ! curl -s "$CDP_URL/json/version" >/dev/null 2>&1; then
  echo " not reachable."
  echo "Error: CDP endpoint not available. Is Electron running with --remote-debugging-port=$CDP_PORT?"
  exit 1
fi
echo " ok."

# --- Workspace dir (directory containing .playwright/) ---
# Walk up from script dir to find project root (contains package.json)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$SCRIPT_DIR"
while [ "$WORKSPACE_DIR" != "/" ]; do
  if [ -f "$WORKSPACE_DIR/package.json" ]; then
    break
  fi
  WORKSPACE_DIR="$(dirname "$WORKSPACE_DIR")"
done
if [ "$WORKSPACE_DIR" = "/" ]; then
  echo "Error: could not find project root (no package.json found)"
  exit 1
fi
echo "Workspace: $WORKSPACE_DIR"
# Run playwright-cli from this checkout so it uses this checkout's session.
cd "$WORKSPACE_DIR"

# --- Generate .playwright/cli.config.json ---
PLAYWRIGHT_DIR="$WORKSPACE_DIR/.playwright"
mkdir -p "$PLAYWRIGHT_DIR"
cat > "$PLAYWRIGHT_DIR/cli.config.json" <<EOF
{
  "browser": {
    "cdpEndpoint": "$CDP_URL",
    "isolated": false
  },
  "allowUnrestrictedFileAccess": true
}
EOF
echo "Wrote $PLAYWRIGHT_DIR/cli.config.json"

# --- Close this checkout's existing daemon ---
playwright-cli close >/dev/null 2>&1 || true

# --- Attach the playwright-cli daemon to the CDP endpoint ---
echo ""
echo "Attaching playwright-cli and discovering pages..."
playwright-cli attach --cdp="$CDP_URL" >/dev/null 2>&1 || {
  echo "playwright-cli attach failed:"
  playwright-cli attach --cdp="$CDP_URL" 2>&1 | tail -20
  exit 1
}
TAB_OUTPUT=$(playwright-cli tab-list 2>&1) || {
  echo "tab-list failed:"
  echo "$TAB_OUTPUT"
  exit 1
}

echo "$TAB_OUTPUT"

# --- Find and select renderer page ---
# Tab list format: "- N: [Title](url)"
# Try file://...index.html first (packaged), then [Chiaroscuro] title (dev server)
TAB_INDEX=$(echo "$TAB_OUTPUT" | grep 'file://' | grep -i 'index\.html' | head -1 | sed -n 's/.*- \([0-9]*\):.*/\1/p' || true)
if [ -z "$TAB_INDEX" ]; then
  TAB_INDEX=$(echo "$TAB_OUTPUT" | grep '\[Chiaroscuro\]' | head -1 | sed -n 's/.*- \([0-9]*\):.*/\1/p' || true)
fi

if [ -n "$TAB_INDEX" ]; then
  echo ""
  echo "Selecting renderer tab (index $TAB_INDEX)..."
  playwright-cli tab-select "$TAB_INDEX" 2>&1 || true
else
  echo ""
  echo "Warning: could not find renderer page. Select manually: playwright-cli tab-select <index>"
fi

# --- Confirm with snapshot ---
echo ""
echo "Taking snapshot to confirm connection..."
playwright-cli snapshot 2>&1 | head -30
echo ""
echo "Connected. Use 'playwright-cli snapshot', 'playwright-cli screenshot', etc."

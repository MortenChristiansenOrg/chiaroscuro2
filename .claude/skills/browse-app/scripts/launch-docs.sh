#!/usr/bin/env bash
# Start the design system Vite dev server in WSL and open it in playwright-cli.
# Handles the .playwright/cli.config.json conflict: if a CDP config exists
# (from connect-app.sh for Electron), it is backed up and replaced with a
# standalone-browser config so playwright-cli launches its own Chromium.
#
# Usage: ./launch-docs.sh
set -euo pipefail

DOCS_PORT=5200
PROJECT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
PW_CONFIG="$PROJECT_DIR/.playwright/cli.config.json"
PW_CONFIG_BAK="$PROJECT_DIR/.playwright/cli.config.cdp.bak"

pkill -f "vite.*design-system" 2>/dev/null || true
sleep 1

# --- Swap playwright-cli config to standalone browser mode ---
if [ -f "$PW_CONFIG" ] && grep -q '"cdpEndpoint"' "$PW_CONFIG" 2>/dev/null; then
  cp "$PW_CONFIG" "$PW_CONFIG_BAK"
  echo "Backed up CDP config → $(basename "$PW_CONFIG_BAK")"
fi
# Close any existing playwright-cli session (CDP or standalone)
playwright-cli close 2>/dev/null || true
# Write standalone config (no CDP)
mkdir -p "$(dirname "$PW_CONFIG")"
cat > "$PW_CONFIG" <<'EOF'
{
  "allowUnrestrictedFileAccess": true
}
EOF
echo "Set playwright-cli config to standalone browser mode."

# Start Vite dev server in background
echo "Starting design system dev server on port $DOCS_PORT..."
cd "$PROJECT_DIR"
bun run docs:dev -- --host &
VITE_PID=$!
echo "Vite PID: $VITE_PID"

# Wait for Vite to be ready
echo -n "Waiting for Vite..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$DOCS_PORT" >/dev/null 2>&1; then
    echo " ready."
    echo ""

    # Auto-open in playwright-cli
    echo "Opening in playwright-cli..."
    playwright-cli open "http://localhost:$DOCS_PORT" 2>&1 || {
      echo "Warning: playwright-cli open failed. Try manually:"
      echo "  playwright-cli open http://localhost:$DOCS_PORT"
    }
    exit 0
  fi
  if [ "$i" -eq 30 ]; then
    echo " timeout waiting for Vite dev server."
    kill $VITE_PID 2>/dev/null
    exit 1
  fi
  echo -n "."
  sleep 1
done

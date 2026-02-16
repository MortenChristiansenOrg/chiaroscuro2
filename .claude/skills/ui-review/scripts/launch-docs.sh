#!/usr/bin/env bash
# Start the design system Vite dev server in WSL.
# playwright-cli handles the browser — no need to launch Edge.
#
# Usage: ./launch-docs.sh
set -euo pipefail

DOCS_PORT=5200
PROJECT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"

pkill -f "vite.*design-system" 2>/dev/null || true
sleep 1

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
    echo "Open in playwright-cli:"
    echo "  playwright-cli open http://localhost:$DOCS_PORT"
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

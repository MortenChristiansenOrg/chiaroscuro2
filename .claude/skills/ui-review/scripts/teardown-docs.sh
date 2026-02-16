#!/usr/bin/env bash
# Stop the design system dev server and playwright-cli browser.
# Safe to run multiple times.
set -e

echo "Tearing down design system dev session..."

# 1. Close playwright-cli browser
if playwright-cli close 2>/dev/null; then
  echo "  Closed playwright-cli browser"
else
  echo "  No playwright-cli browser running"
fi

# 2. Kill Vite dev server
if pkill -f "vite.*design-system" 2>/dev/null; then
  echo "  Killed Vite dev server"
else
  # Fallback: kill by port
  PID=$(lsof -ti :5200 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill $PID 2>/dev/null && echo "  Killed process on port 5200" || echo "  Could not kill port 5200"
  else
    echo "  No Vite dev server running"
  fi
fi

echo "Done."

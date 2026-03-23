#!/usr/bin/env bash
# Stop the Chiaroscuro Electron instance on a specific CDP port.
# Only kills the process listening on the target port.
# Safe to run multiple times.
#
# Usage: ./teardown-app.sh [--cdp-port PORT]
#   --cdp-port PORT   CDP port (default: 9333)
set -e

CDP_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Read from .env.local if --cdp-port not provided
if [ -z "$CDP_PORT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
  if [ -f "$PROJECT_DIR/.env.local" ]; then
    CDP_PORT=$(grep -oP '^ELECTRON_APP_PORT=\K.*' "$PROJECT_DIR/.env.local" | tr -d '[:space:]')
  fi
  if [ -z "$CDP_PORT" ]; then
    echo "Error: ELECTRON_APP_PORT not set in .env.local and no --cdp-port flag provided."
    echo "Add ELECTRON_APP_PORT=<port> to $PROJECT_DIR/.env.local"
    exit 1
  fi
fi

echo "Tearing down Chiaroscuro dev session (port $CDP_PORT)..."

# 0. Close playwright-cli daemon
playwright-cli close 2>/dev/null || true

# 1. Kill the dev server if running
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/.dev-server-pid" ]; then
  DEV_PID=$(cat "$PROJECT_DIR/.dev-server-pid")
  kill "$DEV_PID" 2>/dev/null && echo "  Killed dev server (PID $DEV_PID)" || true
  rm -f "$PROJECT_DIR/.dev-server-pid"
fi

# 2. Kill the process listening on the CDP port
powershell.exe -NoProfile -Command "
  \$conn = Get-NetTCPConnection -LocalPort $CDP_PORT -State Listen -ErrorAction SilentlyContinue
  if (\$conn) {
    Stop-Process -Id \$conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host '  Killed process on port $CDP_PORT'
  } else {
    Write-Host '  No process listening on port $CDP_PORT'
  }
" 2>/dev/null || echo "  Could not check port $CDP_PORT"

echo "Done."

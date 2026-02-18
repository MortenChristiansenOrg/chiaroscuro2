#!/usr/bin/env bash
# Stop the Chiaroscuro Electron instance on a specific CDP port.
# Only kills the process listening on the target port.
# Safe to run multiple times.
#
# Usage: ./teardown-app.sh [--cdp-port PORT]
#   --cdp-port PORT   CDP port (default: 9333)
set -e

CDP_PORT=9333

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "Tearing down Chiaroscuro dev session (port $CDP_PORT)..."

# 0. Close playwright-cli daemon
playwright-cli close 2>/dev/null || true

# 1. Kill the process listening on the CDP port
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

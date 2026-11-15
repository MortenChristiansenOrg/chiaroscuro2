#!/usr/bin/env bash
# Stop the Chiaroscuro instance started by launch-app.sh. Safe to run multiple times.
#
# Usage: teardown-app.sh              # stop the invisible (Xvfb) session
#        teardown-app.sh --windows [--cdp-port PORT]
#                                      # stop a session started with --windows
#   --cdp-port PORT   CDP port of the Windows session (default from .env.local)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
STATE_FILE="$PROJECT_DIR/test-results/browse-app/session.env"
WINDOWS=false
CDP_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --windows) WINDOWS=true; shift ;;
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# 0. Close playwright-cli daemon
playwright-cli close >/dev/null 2>&1 || true

if [[ "$WINDOWS" != true ]]; then
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "No invisible session running."
    exit 0
  fi
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  if [[ -n "${PGID:-}" ]] && kill -0 -- "-$PGID" 2>/dev/null; then
    kill -- "-$PGID" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 -- "-$PGID" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$PGID" 2>/dev/null || true
    echo "Stopped invisible session (process group $PGID)."
  fi
  [[ "${PROFILE:-}" == */chiaroscuro-browse-* ]] && rm -rf "$PROFILE"
  rm -f "$STATE_FILE"
  exit 0
fi

# Windows session started with launch-app.sh --windows.
if [ -z "$CDP_PORT" ]; then
  if [ -f "$PROJECT_DIR/.env.local" ]; then
    CDP_PORT=$(grep -oP '^ELECTRON_APP_PORT=\K.*' "$PROJECT_DIR/.env.local" | tr -d '[:space:]')
  fi
  if [ -z "$CDP_PORT" ]; then
    echo "Error: ELECTRON_APP_PORT not set in .env.local and no --cdp-port flag provided."
    exit 1
  fi
fi

echo "Tearing down Chiaroscuro Windows session (port $CDP_PORT)..."

if [ -f "$PROJECT_DIR/.dev-server-pid" ]; then
  DEV_PID=$(cat "$PROJECT_DIR/.dev-server-pid")
  kill "$DEV_PID" 2>/dev/null && echo "  Killed dev server (PID $DEV_PID)" || true
  rm -f "$PROJECT_DIR/.dev-server-pid"
fi

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

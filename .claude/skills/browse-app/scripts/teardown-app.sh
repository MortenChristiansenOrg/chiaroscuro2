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

# playwright-cli finds its session through the nearest .playwright directory.
# Running it from this checkout, with its own .playwright, keeps it from closing
# the session of an enclosing checkout (e.g. a worktree under .claude/worktrees).
cd "$PROJECT_DIR"
mkdir -p .playwright

if [[ "$WINDOWS" != true ]]; then
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "No invisible session running."
    exit 0
  fi
  playwright-cli close >/dev/null 2>&1 || true
  PGID="" CDP_PORT="" PROFILE=""
  # shellcheck disable=SC1090
  source "$STATE_FILE" || true
  # Signal the group only if it is still this session (PGIDs can be reused):
  # one of its processes must be the Electron launch with this CDP port.
  if [[ "$PGID" =~ ^[0-9]+$ && -n "$CDP_PORT" ]] &&
    pgrep -g "$PGID" -f -- "--remote-debugging-port=$CDP_PORT( |$)" >/dev/null 2>&1; then
    kill -- "-$PGID" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 -- "-$PGID" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$PGID" 2>/dev/null || true
    echo "Stopped invisible session (process group $PGID)."
  else
    echo "Session already stopped."
  fi
  [[ "$PROFILE" == */chiaroscuro-browse-* && -d "$PROFILE" ]] && rm -rf "$PROFILE"
  rm -f "$STATE_FILE"
  exit 0
fi

playwright-cli close >/dev/null 2>&1 || true

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

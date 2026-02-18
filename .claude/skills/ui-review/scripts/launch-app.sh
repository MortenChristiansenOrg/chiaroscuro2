#!/usr/bin/env bash
# Build in WSL, launch Electron on Windows with remote debugging enabled.
# Only kills Chiaroscuro Electron instances, not other Electron apps.
#
# Usage: ./launch-app.sh [--rebuild] [--cdp-port PORT]
#   --rebuild         Force rebuild even if out/ exists
#   --cdp-port PORT   CDP port (default: 9333)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDP_PORT=9333
REBUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=true; shift ;;
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

WIN_USER=$(powershell.exe -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
WIN_DIR="/mnt/c/Users/${WIN_USER}/.chiaroscuro-dev"
WIN_PATH="C:\\Users\\${WIN_USER}\\.chiaroscuro-dev"

mkdir -p "$WIN_DIR"

# Build unless skipped
if [ "$REBUILD" = true ] || [ ! -d "out" ]; then
  echo "Building..."
  bunx electron-vite build
fi

echo "Syncing to Windows..."
rsync -a --delete out/ "$WIN_DIR/out/"
rsync -a --delete resources/ "$WIN_DIR/resources/" 2>/dev/null || true
cp package.json "$WIN_DIR/"

# One-time: install electron on Windows side
if [ ! -d "$WIN_DIR/node_modules/electron" ]; then
  echo "First run: installing Electron on Windows (one-time)..."
  powershell.exe -NoProfile -Command "cd '$WIN_PATH'; npm install --save-dev electron"
fi

# Resolve electron.exe path (direct path avoids npx failures)
ELECTRON_EXE="$WIN_DIR/node_modules/electron/dist/electron.exe"
if [ ! -f "$ELECTRON_EXE" ]; then
  echo "Error: electron.exe not found at $ELECTRON_EXE"
  exit 1
fi
WIN_ELECTRON="$WIN_PATH\\node_modules\\electron\\dist\\electron.exe"

# Kill any existing Chiaroscuro Electron session (not other Electron apps)
powershell.exe -NoProfile -Command "
  Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { \$_.Path -match 'chiaroscuro-dev' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
" 2>/dev/null || true

sleep 1

echo "Launching Electron..."
powershell.exe -NoProfile -Command "
  Start-Process -FilePath '$WIN_ELECTRON' -ArgumentList '.','--remote-debugging-port=$CDP_PORT' -WorkingDirectory '$WIN_PATH'
"

# Wait for CDP endpoint (mirrored networking — direct access, no proxy needed)
echo -n "Waiting for CDP endpoint on port $CDP_PORT..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
    echo " ready."
    curl -s "http://127.0.0.1:$CDP_PORT/json/version" | python3 -m json.tool 2>/dev/null || true
    echo ""
    echo "Connecting playwright-cli via CDP..."
    "$SCRIPT_DIR/connect-app.sh" --cdp-port "$CDP_PORT"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " timeout. Check that Electron launched correctly on Windows."
exit 1

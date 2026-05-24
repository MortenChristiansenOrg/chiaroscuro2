#!/usr/bin/env bash
# Dev workflow: Vite HMR server on WSL + Electron on Windows with CDP.
# Renderer changes hot-reload instantly. Main/preload changes need relaunch.
#
# Usage: ./launch-app.sh [--rebuild] [--cdp-port PORT]
#   --rebuild         Force rebuild even if out/ exists
#   --cdp-port PORT   CDP port (default from .env.local)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
REBUILD=false
CDP_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=true; shift ;;
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Read from .env.local if --cdp-port not provided
if [ -z "$CDP_PORT" ]; then
  if [ -f "$PROJECT_DIR/.env.local" ]; then
    CDP_PORT=$(grep -oP '^ELECTRON_APP_PORT=\K.*' "$PROJECT_DIR/.env.local" | tr -d '[:space:]')
  fi
  if [ -z "$CDP_PORT" ]; then
    echo "Error: ELECTRON_APP_PORT not set in .env.local and no --cdp-port flag provided."
    echo "Add ELECTRON_APP_PORT=<port> to $PROJECT_DIR/.env.local"
    exit 1
  fi
fi

WIN_USER=$(powershell.exe -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
WIN_DIR="/mnt/c/Users/${WIN_USER}/.chiaroscuro-dev"
WIN_PATH="C:\\Users\\${WIN_USER}\\.chiaroscuro-dev"

mkdir -p "$WIN_DIR"

# Build main + preload (renderer served live by Vite)
if [ "$REBUILD" = true ] || [ ! -d "$PROJECT_DIR/out" ]; then
  echo "Building..."
  cd "$PROJECT_DIR"
  bunx electron-vite build
fi

echo "Syncing main + preload to Windows..."
rsync -a --delete "$PROJECT_DIR/out/main" "$PROJECT_DIR/out/preload" "$WIN_DIR/out/"
rsync -a --delete "$PROJECT_DIR/resources/" "$WIN_DIR/resources/" 2>/dev/null || true
cp "$PROJECT_DIR/package.json" "$WIN_DIR/"

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

# Kill all chiaroscuro-dev Electron processes (not just the one on the CDP port —
# stale processes from failed launches may not have bound to the port)
powershell.exe -NoProfile -Command "
  Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { \$_.Path -like '*chiaroscuro-dev*' } |
    ForEach-Object { Stop-Process -Id \$_.Id -Force -ErrorAction SilentlyContinue; Write-Host \"Killed Electron PID \$(\$_.Id)\" }
" 2>/dev/null || true

# Pick a free port for the Vite renderer dev server
RENDERER_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')

# Kill any leftover dev server from a previous launch
if [ -f "$PROJECT_DIR/.dev-server-pid" ]; then
  kill "$(cat "$PROJECT_DIR/.dev-server-pid")" 2>/dev/null || true
  rm -f "$PROJECT_DIR/.dev-server-pid"
fi

echo "Starting renderer dev server on port $RENDERER_PORT..."
cd "$PROJECT_DIR"
ELECTRON_VITE_DEV_SERVER_PORT=$RENDERER_PORT bun run scripts/dev-renderer-server.ts &
DEV_PID=$!
echo "$DEV_PID" > "$PROJECT_DIR/.dev-server-pid"

# Wait for Vite to be ready (should start in ~2s, fail fast if not)
echo "Waiting for dev server..."
sleep 2
if ! kill -0 "$DEV_PID" 2>/dev/null; then
  echo "Error: dev server exited."
  rm -f "$PROJECT_DIR/.dev-server-pid"
  exit 1
fi
if ! curl -s --max-time 3 "http://localhost:$RENDERER_PORT/" >/dev/null 2>&1; then
  echo "Error: dev server not responding on port $RENDERER_PORT after 5s."
  kill "$DEV_PID" 2>/dev/null || true
  rm -f "$PROJECT_DIR/.dev-server-pid"
  exit 1
fi
echo "Dev server ready."

echo "Launching Electron (renderer at port $RENDERER_PORT, CDP on port $CDP_PORT)..."
powershell.exe -NoProfile -Command "
  \$env:ELECTRON_RENDERER_URL = 'http://localhost:$RENDERER_PORT'
  \$env:NODE_ENV_ELECTRON_VITE = 'development'
  Start-Process -FilePath '$WIN_ELECTRON' -ArgumentList '.','--remote-debugging-port=$CDP_PORT' -WorkingDirectory '$WIN_PATH'
"

# Wait for CDP endpoint (mirrored networking — direct access, no proxy needed)
echo "Waiting for CDP endpoint on port $CDP_PORT..."
sleep 5
if ! curl -s --max-time 3 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
  echo "Error: CDP endpoint not responding on port $CDP_PORT after 8s."
  echo "Check that Electron launched correctly on Windows."
  kill "$DEV_PID" 2>/dev/null || true
  rm -f "$PROJECT_DIR/.dev-server-pid"
  exit 1
fi
echo "CDP ready."
curl -s "http://127.0.0.1:$CDP_PORT/json/version" | python3 -m json.tool 2>/dev/null || true
echo ""
echo "Connecting playwright-cli via CDP..."
"$SCRIPT_DIR/connect-app.sh" --cdp-port "$CDP_PORT"

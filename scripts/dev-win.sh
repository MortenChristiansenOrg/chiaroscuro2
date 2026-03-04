#!/bin/bash
# Dev workflow: Vite HMR server on WSL + Electron on Windows.
# Renderer changes hot-reload instantly. Main/preload changes need Ctrl-C + rerun.
set -e

RENDERER_PORT=5199

WIN_USER=$(powershell.exe -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
WIN_DIR="/mnt/c/Users/${WIN_USER}/.chiaroscuro-dev"
WIN_PATH="C:\\Users\\${WIN_USER}\\.chiaroscuro-dev"

mkdir -p "$WIN_DIR"

# Build main + preload (renderer will be served live by Vite)
echo "Building main + preload..."
bunx electron-vite build

echo "Syncing to Windows..."
rsync -a --delete out/main out/preload "$WIN_DIR/out/"
rsync -a --delete resources/ "$WIN_DIR/resources/" 2>/dev/null || true
cp package.json "$WIN_DIR/"

# One-time: install electron on Windows side
if [ ! -d "$WIN_DIR/node_modules/electron" ]; then
  echo "First run: installing Electron on Windows (one-time)..."
  powershell.exe -NoProfile -Command "cd '$WIN_PATH'; npm install --save-dev electron"
fi

# Native deps needed at runtime on Windows
if [ ! -d "$WIN_DIR/node_modules/koffi" ]; then
  echo "Installing native deps on Windows..."
  powershell.exe -NoProfile -Command "cd '$WIN_PATH'; npm install koffi"
fi

# Resolve electron.exe path
ELECTRON_EXE="$WIN_DIR/node_modules/electron/dist/electron.exe"
if [ ! -f "$ELECTRON_EXE" ]; then
  echo "Error: electron.exe not found at $ELECTRON_EXE"
  exit 1
fi
WIN_ELECTRON="$WIN_PATH\\node_modules\\electron\\dist\\electron.exe"

# Kill any existing Electron from previous run (only ours, not other Electron apps)
powershell.exe -NoProfile -Command "
  Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { \$_.Path -like '*chiaroscuro-dev*' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
" 2>/dev/null || true

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
  powershell.exe -NoProfile -Command "
    Get-Process -Name electron -ErrorAction SilentlyContinue |
      Where-Object { \$_.Path -like '*chiaroscuro-dev*' } |
      Stop-Process -Force -ErrorAction SilentlyContinue
  " 2>/dev/null || true
}
trap cleanup EXIT

# Start Vite renderer dev server (stays running for HMR)
echo "Starting renderer dev server on port $RENDERER_PORT..."
bun run scripts/dev-renderer-server.ts &
VITE_PID=$!

# Wait for Vite to be ready
echo -n "Waiting for dev server..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$RENDERER_PORT/" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo " failed (server exited)."
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Launch Electron on Windows, pointing at the WSL Vite dev server
# Use & (call operator) not Start-Process — Start-Process doesn't inherit env vars
echo "Launching Electron on Windows..."
powershell.exe -NoProfile -Command "
  \$env:ELECTRON_RENDERER_URL = 'http://localhost:$RENDERER_PORT'
  \$env:NODE_ENV_ELECTRON_VITE = 'development'
  Set-Location '$WIN_PATH'
  & '$WIN_ELECTRON' '.'
" &

# Keep script alive (Vite server runs until Ctrl-C)
echo ""
echo "Dev server running. Press Ctrl-C to stop."
wait $VITE_PID

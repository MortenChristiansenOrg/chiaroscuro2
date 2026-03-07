#!/bin/bash
# Dev workflow: Vite HMR server on WSL + Electron on Windows.
# Renderer changes hot-reload instantly. Main/preload changes need Ctrl-C + rerun.
set -e

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

# Resolve electron.exe path
ELECTRON_EXE="$WIN_DIR/node_modules/electron/dist/electron.exe"
if [ ! -f "$ELECTRON_EXE" ]; then
  echo "Error: electron.exe not found at $ELECTRON_EXE"
  exit 1
fi
WIN_ELECTRON="$WIN_PATH\\node_modules\\electron\\dist\\electron.exe"

# Cleanup on exit: kill only this instance's Vite + Electron
cleanup() {
  echo ""
  echo "Shutting down..."
  if [ -n "$VITE_PID" ]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "$ELECTRON_WIN_PID" ]; then
    powershell.exe -NoProfile -Command "
      Stop-Process -Id $ELECTRON_WIN_PID -Force -ErrorAction SilentlyContinue
    " 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Pick a free port for the Vite renderer dev server
RENDERER_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')

echo "Starting renderer dev server on port $RENDERER_PORT..."
ELECTRON_VITE_DEV_SERVER_PORT=$RENDERER_PORT bun run scripts/dev-renderer-server.ts &
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

if ! curl -s "http://localhost:$RENDERER_PORT/" >/dev/null 2>&1; then
  echo " failed (timed out waiting for dev server)."
  exit 1
fi

# Launch Electron on Windows, capture its PID for cleanup
# Env vars set in the same PS session are inherited by Start-Process
echo "Launching Electron on Windows (renderer at port $RENDERER_PORT)..."
ELECTRON_WIN_PID=$(powershell.exe -NoProfile -Command "
  \$env:ELECTRON_RENDERER_URL = 'http://localhost:$RENDERER_PORT'
  \$env:NODE_ENV_ELECTRON_VITE = 'development'
  Set-Location '$WIN_PATH'
  \$logFile = Join-Path '$WIN_PATH' 'electron.log'
  \$errFile = Join-Path '$WIN_PATH' 'electron-err.log'
  \$p = Start-Process -FilePath '$WIN_ELECTRON' -ArgumentList '.' -PassThru -RedirectStandardOutput \$logFile -RedirectStandardError \$errFile
  Write-Output \$p.Id
" | tr -d '\r')
echo "Electron PID (Windows): $ELECTRON_WIN_PID"

# Keep script alive (Vite server runs until Ctrl-C)
echo ""
echo "Dev server running. Press Ctrl-C to stop."
wait $VITE_PID

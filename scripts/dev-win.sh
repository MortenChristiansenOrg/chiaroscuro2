#!/bin/bash
# Dev workflow: Vite HMR server on WSL + Electron on Windows.
# Renderer changes hot-reload instantly. Main/preload changes need Ctrl-C + rerun.
set -e

find_powershell() {
  if command -v powershell.exe >/dev/null 2>&1; then
    command -v powershell.exe
    return
  fi

  for path in \
    /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
    /mnt/c/Windows/Sysnative/WindowsPowerShell/v1.0/powershell.exe; do
    if [ -x "$path" ]; then
      printf '%s\n' "$path"
      return
    fi
  done
}

POWERSHELL=$(find_powershell)
if [ -z "$POWERSHELL" ]; then
  cat >&2 <<'EOF'
Error: powershell.exe was not found.

dev:win must be run from WSL with Windows interop enabled. If you are running
inside Linux, a container, or WSL without Windows interop, use:

  bun run dev

For WSL, enable Windows interop and restart WSL:

  /etc/wsl.conf:
    [interop]
    enabled = true
    appendWindowsPath = true

  PowerShell:
    wsl --shutdown
EOF
  exit 1
fi

WIN_USER=$("$POWERSHELL" -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
if [ -z "$WIN_USER" ]; then
  echo "Error: could not determine the Windows user name from PowerShell." >&2
  exit 1
fi

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
  "$POWERSHELL" -NoProfile -Command "
    Set-Location '$WIN_PATH'
    npm install --ignore-scripts --save-dev electron
    if (\$LASTEXITCODE -ne 0) { exit \$LASTEXITCODE }
    node node_modules/electron/install.js
    if (\$LASTEXITCODE -ne 0) { exit \$LASTEXITCODE }
  "
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
    "$POWERSHELL" -NoProfile -Command "
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
ELECTRON_WIN_PID=$("$POWERSHELL" -NoProfile -Command "
  \$env:ELECTRON_RENDERER_URL = 'http://localhost:$RENDERER_PORT'
  \$env:NODE_ENV_ELECTRON_VITE = 'development'
  Set-Location '$WIN_PATH'
  \$p = Start-Process -FilePath '$WIN_ELECTRON' -ArgumentList '.' -PassThru
  Write-Output \$p.Id
" | tr -d '\r')
if ! [[ "$ELECTRON_WIN_PID" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: failed to launch Electron on Windows (invalid PID: $ELECTRON_WIN_PID)" >&2
  exit 1
fi
echo "Electron PID (Windows): $ELECTRON_WIN_PID"

# Keep script alive (Vite server runs until Ctrl-C)
echo ""
echo "Dev server running. Press Ctrl-C to stop."
wait $VITE_PID

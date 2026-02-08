#!/usr/bin/env bash
# Start the design system Vite dev server in WSL and open it in Edge on Windows
# with CDP enabled. Uses the same CDP proxy as the Electron app launcher.
#
# Usage: ./launch-docs.sh
set -e

PORT="${CHIAROSCURO_DEBUG_PORT:-9222}"
DESKTOP_NAME="Chiaroscuro Dev"
DOCS_PORT=5200
PROJECT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Get WSL IP that Windows can reach
WSL_IP=$(hostname -I | awk '{print $1}')
DOCS_URL="http://${WSL_IP}:${DOCS_PORT}"

# Kill any existing browser debug session and Vite server
powershell.exe -NoProfile -Command "
  Get-Process -Name msedge -ErrorAction SilentlyContinue |
    Where-Object { \$_.CommandLine -match 'chiaroscuro-docs-profile' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
" 2>/dev/null || true
pkill -f "vite.*design-system" 2>/dev/null || true
sleep 1

# Start Vite dev server in background (--host binds to 0.0.0.0 so Windows can reach it)
echo "Starting design system dev server on port $DOCS_PORT..."
cd "$PROJECT_DIR"
bun run docs:dev -- --host &
VITE_PID=$!
echo "Vite PID: $VITE_PID"

# Wait for Vite to be ready
echo -n "Waiting for Vite..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$DOCS_PORT" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo " timeout waiting for Vite dev server."
    kill $VITE_PID 2>/dev/null
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Resolve Windows temp dir for Edge profile
WIN_USER=$(powershell.exe -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
WIN_PROFILE_DIR="C:\\Users\\${WIN_USER}\\.chiaroscuro-docs-profile"

# Check if VirtualDesktop module is available
HAS_VDESKTOP=$(powershell.exe -NoProfile -Command "
  if (Get-Module -ListAvailable -Name VirtualDesktop) { 'yes' } else { 'no' }
" | tr -d '\r')

if [ "$HAS_VDESKTOP" = "yes" ]; then
  echo "Launching Edge on virtual desktop '$DESKTOP_NAME'..."
  powershell.exe -NoProfile -Command "
    Import-Module VirtualDesktop 2>\$null

    \$origDesktop = Get-CurrentDesktop
    \$origIdx = 0
    \$desktops = @(Get-Desktop 0)
    for (\$i = 1; \$i -lt (Get-DesktopCount); \$i++) {
      \$desktops += Get-Desktop \$i
    }
    for (\$i = 0; \$i -lt \$desktops.Count; \$i++) {
      if (Test-CurrentDesktop \$desktops[\$i]) { \$origIdx = \$i; break }
    }

    \$targetIdx = Get-DesktopCount
    if (\$targetIdx -lt 2) { New-Desktop | Out-Null }
    \$targetIdx = if (\$origIdx -eq 0) { 1 } else { 0 }

    \$targetDesktop = Get-Desktop \$targetIdx
    Set-DesktopName \$targetDesktop '$DESKTOP_NAME'

    Switch-Desktop \$targetIdx
    Start-Process 'msedge.exe' -ArgumentList '--remote-debugging-port=$PORT','--user-data-dir=$WIN_PROFILE_DIR','--no-first-run','--no-default-browser-check','$DOCS_URL'
    Start-Sleep -Milliseconds 1000
    Switch-Desktop \$origIdx
  "
else
  echo "VirtualDesktop module not found — launching Edge on current desktop."
  powershell.exe -NoProfile -Command "
    Start-Process 'msedge.exe' -ArgumentList '--remote-debugging-port=$PORT','--user-data-dir=$WIN_PROFILE_DIR','--no-first-run','--no-default-browser-check','$DOCS_URL'
  "
fi

# Start CDP proxy
pkill -f "cdp-proxy.mjs" 2>/dev/null || true
powershell.exe -NoProfile -Command "
  Get-NetTCPConnection -LocalPort 9223 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
" 2>/dev/null || true
sleep 1

echo "Starting CDP proxy..."
node "$SCRIPT_DIR/cdp-proxy.mjs" &
CDP_PROXY_PID=$!
echo "CDP proxy PID: $CDP_PROXY_PID"

# Wait for CDP endpoint
echo -n "Waiting for CDP endpoint..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo " ready."
    curl -s "http://127.0.0.1:$PORT/json/version" | python3 -m json.tool 2>/dev/null || true
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " timeout. Check that Edge launched correctly on Windows."
kill $CDP_PROXY_PID 2>/dev/null
exit 1

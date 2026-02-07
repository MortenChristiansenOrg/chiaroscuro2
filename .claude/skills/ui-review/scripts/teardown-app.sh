#!/usr/bin/env bash
# Stop the Chiaroscuro app, CDP proxy, and clean up the virtual desktop.
# Safe to run multiple times.
set -e

echo "Tearing down Chiaroscuro dev session..."

# 1. Kill WSL-side CDP proxy
if pkill -f "cdp-proxy.mjs" 2>/dev/null; then
  echo "  Killed WSL CDP proxy"
else
  echo "  No WSL CDP proxy running"
fi

# 2. Kill Windows-side node relay on port 9223
powershell.exe -NoProfile -Command "
  \$conn = Get-NetTCPConnection -LocalPort 9223 -State Listen -ErrorAction SilentlyContinue
  if (\$conn) {
    \$conn | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Write-Host '  Killed Windows relay on port 9223'
  } else {
    Write-Host '  No Windows relay running'
  }
" 2>/dev/null || echo "  Could not check Windows relay"

# 3. Remove virtual desktop BEFORE killing Electron (so desktop still exists)
powershell.exe -NoProfile -Command "
  Import-Module VirtualDesktop 2>\$null
  if (-not (Get-Module VirtualDesktop)) { return }
  for (\$i = 0; \$i -lt (Get-DesktopCount); \$i++) {
    \$d = Get-Desktop \$i
    if ((Get-DesktopName \$d) -eq 'Chiaroscuro Dev') {
      Remove-Desktop \$d -ErrorAction SilentlyContinue
      Write-Host '  Removed Chiaroscuro Dev desktop'
      return
    }
  }
  Write-Host '  No Chiaroscuro Dev desktop found'
" 2>/dev/null || echo "  Could not check virtual desktops"

# 4. Kill Electron on Windows (last, so desktop removal can find it)
powershell.exe -NoProfile -Command "
  \$procs = Get-Process -Name electron -ErrorAction SilentlyContinue
  if (\$procs) {
    \$procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host '  Killed Electron'
  } else {
    Write-Host '  No Electron running'
  }
" 2>/dev/null || echo "  Could not check Electron"

echo "Done."

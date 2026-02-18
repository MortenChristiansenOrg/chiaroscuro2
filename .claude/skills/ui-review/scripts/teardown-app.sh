#!/usr/bin/env bash
# Stop the Chiaroscuro Electron instance and clean up the virtual desktop.
# Only kills Electron processes launched from the chiaroscuro-dev directory.
# Safe to run multiple times.
set -e

echo "Tearing down Chiaroscuro dev session..."

# 0. Close playwright-cli daemon
playwright-cli close 2>/dev/null || true

# 1. Remove virtual desktop BEFORE killing Electron (so desktop still exists)
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

# 2. Kill only Chiaroscuro Electron (not other Electron apps)
powershell.exe -NoProfile -Command "
  \$procs = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { \$_.Path -match 'chiaroscuro-dev' }
  if (\$procs) {
    \$procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host '  Killed Chiaroscuro Electron'
  } else {
    Write-Host '  No Chiaroscuro Electron running'
  }
" 2>/dev/null || echo "  Could not check Electron"

echo "Done."

#!/usr/bin/env bash
# Stop the Chiaroscuro Electron instance.
# Only kills Electron processes launched from the chiaroscuro-dev directory.
# Safe to run multiple times.
set -e

echo "Tearing down Chiaroscuro dev session..."

# 0. Close playwright-cli daemon
playwright-cli close 2>/dev/null || true

# 1. Kill only Chiaroscuro Electron (not other Electron apps)
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

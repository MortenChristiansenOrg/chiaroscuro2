#!/usr/bin/env bash
# Stop the design system dev server, Edge browser, and virtual desktop.
# Only kills Edge processes using the docs profile, not other Edge instances.
# Safe to run multiple times.
set -e

echo "Tearing down design system dev session..."

# 1. Remove virtual desktop BEFORE killing Edge
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

# 2. Kill the Edge instance using the docs profile (not other Edge instances)
powershell.exe -NoProfile -Command "
  \$procs = Get-Process -Name msedge -ErrorAction SilentlyContinue |
    Where-Object { \$_.CommandLine -match 'chiaroscuro-docs-profile' }
  if (\$procs) {
    \$procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host '  Killed Edge (docs profile)'
  } else {
    Write-Host '  No Edge docs instance running'
  }
" 2>/dev/null || echo "  Could not check Edge"

# 3. Kill Vite dev server
if pkill -f "vite.*design-system" 2>/dev/null; then
  echo "  Killed Vite dev server"
else
  # Fallback: kill by port
  PID=$(lsof -ti :5200 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill $PID 2>/dev/null && echo "  Killed process on port 5200" || echo "  Could not kill port 5200"
  else
    echo "  No Vite dev server running"
  fi
fi

echo "Done."

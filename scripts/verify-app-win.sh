#!/usr/bin/env bash
# Run the same Playwright/Electron fixture natively on Windows from WSL.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
for prerequisite in powershell.exe wslpath rsync; do
  command -v "$prerequisite" >/dev/null || { echo "Missing $prerequisite. Run this launcher from WSL with Windows interop enabled." >&2; exit 1; }
done
WIN_PROFILE=$(powershell.exe -NoProfile -Command 'Write-Output $env:USERPROFILE' | tr -d '\r')
VERIFY_DIR="$(wslpath "$WIN_PROFILE")/.chiaroscuro-verification"
mkdir -p "$VERIFY_DIR"
MODE=verify:app
if [[ "${1:-}" == "--interactive" ]]; then MODE=agent:app; shift; fi
if [[ "${1:-}" == "--address-bar" ]]; then MODE=diagnose:address-bar; shift; fi
bun run build
rsync -a --delete out e2e src resources "$VERIFY_DIR/"
cp package.json bun.lock bunfig.toml playwright.verification.config.ts "$VERIFY_DIR/"
python3 - "$VERIFY_DIR/arguments.json" "$MODE" "$@" <<'PY'
import json, sys
with open(sys.argv[1], 'w') as f:
    json.dump({'command': sys.argv[2], 'args': sys.argv[3:]}, f)
PY
cat > "$VERIFY_DIR/run.ps1" <<'PS'
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force test-results | Out-Null
Start-Transcript -Path test-results\launcher.log -Force | Out-Null
$env:DEBUG = 'pw:browser'
if (Test-Path "$PSScriptRoot\runtime") { $env:PATH = "$PSScriptRoot\runtime;" + $env:PATH }
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  $candidate = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
  if (Test-Path $candidate) { $env:PATH = (Split-Path $candidate) + ';' + $env:PATH }
}
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw 'Missing native Windows Bun. Install Bun 1.3.11+ on Windows and rerun bun run verify:app:win.'
}
$version = [version](bun --version)
if ($version -lt [version]'1.3.11') { throw 'Windows Bun 1.3.11+ is required.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24.20.0 LTS on Windows for Playwright.' }
$nodeVersion = [version]((node --version).TrimStart('v'))
if ($nodeVersion -lt [version]'24.15.0') { throw 'Node.js 24.15+ is required; the repository pins 24.20.0 LTS.' }
bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$request = Get-Content -Raw arguments.json | ConvertFrom-Json
$scenarioArgs = @($request.args)
bun run $request.command @scenarioArgs
$result = $LASTEXITCODE
Stop-Transcript | Out-Null
exit $result
PS
set +e
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$VERIFY_DIR/run.ps1")"
result=$?
set -e
mkdir -p test-results/windows
if [ -d "$VERIFY_DIR/test-results" ]; then
  rsync -a "$VERIFY_DIR/test-results/" test-results/windows/
fi
exit "$result"

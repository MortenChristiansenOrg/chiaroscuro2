#!/usr/bin/env bash
set -euo pipefail
for prerequisite in openbox obxprop xcompmgr; do
  command -v "$prerequisite" >/dev/null || { echo "Missing $prerequisite. Install xvfb, xauth, openbox and xcompmgr for Linux verification." >&2; exit 1; }
done
mkdir -p test-results
openbox >test-results/desktop.log 2>&1 &
manager=$!
xcompmgr -c >test-results/compositor.log 2>&1 &
compositor=$!
trap 'kill "$manager" "$compositor" 2>/dev/null || true' EXIT
# Wait on the EWMH readiness property instead of assuming the desktop has started.
ready=false
for _ in {1..100}; do
  if ! kill -0 "$manager" 2>/dev/null; then cat test-results/desktop.log >&2; exit 1; fi
  if ! kill -0 "$compositor" 2>/dev/null; then cat test-results/compositor.log >&2; exit 1; fi
  if obxprop --root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q '(WINDOW) ='; then ready=true; break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then echo "Window manager readiness timed out; inspect test-results/desktop.log" >&2; exit 1; fi
"$@"

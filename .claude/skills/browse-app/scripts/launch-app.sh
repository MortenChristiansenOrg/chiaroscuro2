#!/usr/bin/env bash
# Launch Chiaroscuro for agent browsing and connect playwright-cli to it via CDP.
#
# By default the built app runs in WSL inside a virtual X server (Xvfb), so no
# window appears on the user's desktop. It uses an isolated, temporary profile.
#
# Usage: launch-app.sh [--rebuild] [--cdp-port PORT]
#        launch-app.sh --windows [--rebuild] [--cdp-port PORT]
#        launch-app.sh --isolated [ARGS...]   # bun run agent:app (JSONL controller)
#        launch-app.sh --verify [ARGS...]     # bun run verify:app (scenarios)
#   --rebuild         Rebuild even if out/ matches the sources
#   --cdp-port PORT   CDP port (default: a free port)
#   --windows         Run Electron natively on Windows instead. This opens a
#                     visible window; use it only for Windows-specific behavior
#                     or when the user asks for it.
#
# Session details (CDP port, debug server URL and token, process group) are
# written to test-results/browse-app/session.env. Stop with teardown-app.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

case "${1:-}" in
  --isolated) shift; cd "$PROJECT_DIR"; exec bun run agent:app "$@" ;;
  --verify) shift; cd "$PROJECT_DIR"; exec bun run verify:app "$@" ;;
esac
for arg in "$@"; do
  if [[ "$arg" == "--windows" ]]; then
    args=()
    for a in "$@"; do [[ "$a" == "--windows" ]] || args+=("$a"); done
    exec "$SCRIPT_DIR/launch-app-windows.sh" "${args[@]}"
  fi
done

REBUILD=false
CDP_PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=true; shift ;;
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"
STATE_DIR="$PROJECT_DIR/test-results/browse-app"
STATE_FILE="$STATE_DIR/session.env"
LOG_FILE="$STATE_DIR/app.log"

command -v xvfb-run >/dev/null || { echo "Error: xvfb-run not found. Install xvfb and xauth."; exit 1; }
command -v playwright-cli >/dev/null || { echo "Error: playwright-cli not found on PATH."; exit 1; }

# Stop a previous headless session from this checkout.
"$SCRIPT_DIR/teardown-app.sh" >/dev/null 2>&1 || true
mkdir -p "$STATE_DIR"

if [[ "$REBUILD" == true ]] || ! bun scripts/stamp-build.ts check >/dev/null 2>&1; then
  echo "Building..."
  bun run build >"$STATE_DIR/build.log" 2>&1 || { tail -40 "$STATE_DIR/build.log"; echo "Error: build failed."; exit 1; }
fi
ELECTRON="$PROJECT_DIR/node_modules/electron/dist/electron"
[[ -x "$ELECTRON" ]] || bun run setup:electron

if [[ -z "$CDP_PORT" ]]; then
  CDP_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
fi
PROFILE=$(mktemp -d "${TMPDIR:-/tmp}/chiaroscuro-browse-XXXXXX")
TOKEN=$(cat /proc/sys/kernel/random/uuid)
PGID=""
LAUNCHED=false

# Until the session is connected, any exit (error, failed check, signal) stops
# what this script started.
cleanup() {
  [[ "$LAUNCHED" == true ]] && return
  if [[ -n "$PGID" ]]; then
    # The child itself, in case its process group has not formed yet.
    kill "$PGID" 2>/dev/null || true
    kill -- "-$PGID" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 -- "-$PGID" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$PGID" 2>/dev/null || true
    wait "$PGID" 2>/dev/null || true
  fi
  rm -rf "$PROFILE"
  rm -f "$STATE_FILE"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() {
  echo "Error: $1"
  echo "--- $LOG_FILE (tail) ---"
  tail -30 "$LOG_FILE" || true
  exit 1
}

# Pipe-separated PIDs of the launched process group (empty when it is gone).
group_pids() { pgrep -g "$PGID" 2>/dev/null | paste -sd'|' || true; }
# True when a process of the launched group listens on the given port.
group_listens_on() {
  local pids
  pids=$(group_pids)
  [[ -n "$pids" ]] && ss -ltnpH "sport = :$1" 2>/dev/null | grep -qE "pid=($pids),"
}

# A window manager and compositor give focus, maximize and popup behavior closer
# to a real desktop. Without them the app still runs, but window management is basic.
DESKTOP=()
if command -v openbox >/dev/null && command -v obxprop >/dev/null && command -v xcompmgr >/dev/null; then
  DESKTOP=(bash scripts/verification-desktop.sh)
else
  echo "Note: openbox/xcompmgr not installed; running Xvfb without a window manager."
fi

echo "Launching Electron invisibly (Xvfb 1920x1080, CDP port $CDP_PORT)..."
# WAYLAND_DISPLAY is removed so Electron cannot reach WSLg and show a window.
# setsid makes the launch its own process group, so teardown can stop all of it.
# xvfb-run cannot handle a TMPDIR containing spaces, so it gets /tmp.
setsid env -u WAYLAND_DISPLAY -u ELECTRON_RENDERER_URL -u ELECTRON_RUN_AS_NODE TMPDIR=/tmp \
  NODE_ENV=test DATA_DIR="$PROFILE" CHIAROSCURO_AUTOMATION=1 CHIAROSCURO_DEBUG_TOKEN="$TOKEN" \
  xvfb-run -a -s "-screen 0 1920x1080x24" "${DESKTOP[@]}" \
  "$ELECTRON" --ozone-platform=x11 --no-sandbox --remote-debugging-port="$CDP_PORT" \
  "$PROJECT_DIR/out/main/index.js" >"$LOG_FILE" 2>&1 </dev/null &
PGID=$!
# setsid makes the child its own group leader shortly after the fork; wait for it.
for _ in $(seq 1 100); do
  [[ "$(ps -o pgid= -p "$PGID" 2>/dev/null | tr -d ' ')" == "$PGID" ]] && break
  kill -0 "$PGID" 2>/dev/null || break
  sleep 0.02
done

# Values are shell-quoted because teardown-app.sh sources this file.
{
  printf 'PGID=%q\n' "$PGID"
  printf 'CDP_PORT=%q\n' "$CDP_PORT"
  printf 'PROFILE=%q\n' "$PROFILE"
  printf 'DEBUG_TOKEN=%q\n' "$TOKEN"
} >"$STATE_FILE"

echo "Waiting for CDP endpoint..."
for _ in $(seq 1 150); do
  kill -0 -- "-$PGID" 2>/dev/null || fail "Electron exited during startup."
  group_listens_on "$CDP_PORT" && break
  sleep 0.2
done
# The port must belong to this launch, not to another app already using it.
group_listens_on "$CDP_PORT" || fail "CDP not ready on port $CDP_PORT after 30s (is the port in use?)."
curl -s --max-time 2 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1 || fail "CDP endpoint does not answer."
echo "CDP ready."

# The automation debug server listens on a random port; find it among the
# process group's listening sockets and confirm it answers with the token.
DEBUG_URL=""
for _ in $(seq 1 50); do
  pids=$(group_pids)
  [[ -n "$pids" ]] || fail "Electron exited during startup."
  for port in $(ss -ltnpH 2>/dev/null | grep -E "pid=($pids)," | awk '{print $4}' | sed 's/.*://' | sort -u); do
    [[ "$port" == "$CDP_PORT" ]] && continue
    if curl -sf --max-time 1 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$port/" >/dev/null 2>&1; then
      DEBUG_URL="http://127.0.0.1:$port"
      break 2
    fi
  done
  sleep 0.2
done
if [[ -n "$DEBUG_URL" ]]; then
  printf 'DEBUG_URL=%q\n' "$DEBUG_URL" >>"$STATE_FILE"
  echo "Debug server: $DEBUG_URL (token in $STATE_FILE)"
else
  echo "Warning: debug server not found; the debug-app skill will not work for this session."
fi

echo ""
echo "Connecting playwright-cli via CDP..."
"$SCRIPT_DIR/connect-app.sh" --cdp-port "$CDP_PORT"
LAUNCHED=true

---
name: debug-app
description: Debug and automate the Chiaroscuro browser app via its HTTP debug server. Use when you need to inspect app state, view command/event history, read debug logs, list registered commands, or send commands to the running app. Trigger phrases include "debug the app", "inspect app state", "send a command", "check debug log", "what commands are registered".
---

# Goal

Inspect and control the running Chiaroscuro app via the debug HTTP server (`127.0.0.1:19400`).

## Prerequisites

The app must be running in dev mode (`bun dev`). The debug server is enabled by default in dev. Port defaults to `19400`; if busy, tries up to 10 consecutive ports. Configurable in Settings > Developer.

## Base URL

```
http://127.0.0.1:19400
```

All endpoints accept `?pretty` for formatted JSON output. All responses include CORS headers.

## Endpoints

### GET / — Overview

Returns uptime, port, history count, registered state providers, and endpoint list.

```bash
curl -s http://127.0.0.1:19400/?pretty
```

### GET /state — All feature state

Returns state from all registered state providers.

| Param | Description |
|-------|-------------|
| `features` | Comma-separated feature names to filter |
| `fields` | Comma-separated dot-path fields to pluck from each feature's state |

```bash
# All state
curl -s 'http://127.0.0.1:19400/state?pretty'

# Specific features
curl -s 'http://127.0.0.1:19400/state?features=tabs,settings&pretty'

# Pluck specific fields
curl -s 'http://127.0.0.1:19400/state?features=tabs&fields=activeTab,count&pretty'
```

### GET /state/{feature} — Single feature state

Returns state for one feature. Returns 404 if feature not found.

| Param | Description |
|-------|-------------|
| `fields` | Comma-separated dot-path fields to pluck |

```bash
curl -s 'http://127.0.0.1:19400/state/tabs?pretty'
curl -s 'http://127.0.0.1:19400/state/tabs?fields=activeTab&pretty'
```

### GET /history — Command/event history

Ring buffer of commands sent, events emitted, and handler registrations (max 1000 entries).

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `50` | Max entries to return |
| `order` | `desc` | Sort order: `asc` or `desc` |
| `type` | all | Comma-separated: `command`, `event`, `registration` |
| `name` | all | Exact name or glob with trailing `*` (e.g. `tabs:*`) |
| `since` | — | Timestamp (ms) or ISO date string |
| `until` | — | Timestamp (ms) or ISO date string |
| `errors` | `false` | Set `true` to show only failed commands |
| `payload` | `false` | Set `true` to include payload/response/error detail |

Entry fields: `id`, `timestamp`, `type`, `name`, and when `payload=true`: `payload`, `response`, `error`, `durationMs`.

```bash
# Recent 10 commands with payloads
curl -s 'http://127.0.0.1:19400/history?type=command&limit=10&payload=true&pretty'

# Events matching a prefix
curl -s 'http://127.0.0.1:19400/history?type=event&name=tabs:*&pretty'

# Failed commands only
curl -s 'http://127.0.0.1:19400/history?errors=true&payload=true&pretty'

# Oldest first
curl -s 'http://127.0.0.1:19400/history?order=asc&limit=20&pretty'
```

### GET /log — Debug log

Structured log ring buffer (max 2000 entries). Entries: `id`, `timestamp`, `level`, `source`, `message`, and optionally `data`.

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `50` | Max entries to return |
| `order` | `desc` | Sort order: `asc` or `desc` |
| `level` | all | Min level: `debug`, `info`, `warn`, `error` (filters >=) |
| `source` | all | Exact source or glob with trailing `*` |
| `since` | — | Timestamp (ms) or ISO date string |
| `until` | — | Timestamp (ms) or ISO date string |
| `data` | `false` | Set `true` to include data field |

```bash
# Errors and warnings
curl -s 'http://127.0.0.1:19400/log?level=warn&pretty'

# Logs from a specific source
curl -s 'http://127.0.0.1:19400/log?source=debug-server&pretty'

# With data payloads
curl -s 'http://127.0.0.1:19400/log?level=error&data=true&pretty'
```

### GET /commands — Registered commands

Returns list of all registered command handler names.

```bash
curl -s 'http://127.0.0.1:19400/commands?pretty'
```

### POST /commands/send — Send a command

Execute a command on the command bus. Body: `{ "name": "command:name", "payload": <value> }`.

Returns `{ "response": <value> }` on success, 404 if no handler, 500 on error.

```bash
# Send a command with no payload
curl -s -X POST http://127.0.0.1:19400/commands/send \
  -H 'Content-Type: application/json' \
  -d '{"name": "debug-server:stop"}' | jq

# Send a command with payload
curl -s -X POST http://127.0.0.1:19400/commands/send \
  -H 'Content-Type: application/json' \
  -d '{"name": "tabs:create", "payload": {"url": "https://example.com"}}' | jq
```

### DELETE /history — Clear history

```bash
curl -s -X DELETE http://127.0.0.1:19400/history
```

### DELETE /log — Clear log

```bash
curl -s -X DELETE http://127.0.0.1:19400/log
```

## Common workflows

### Check what commands are available, then send one

```bash
curl -s 'http://127.0.0.1:19400/commands?pretty'
# Pick a command from the list, then:
curl -s -X POST http://127.0.0.1:19400/commands/send \
  -H 'Content-Type: application/json' \
  -d '{"name": "the:command", "payload": null}'
```

### Investigate errors

```bash
# Check for failed commands
curl -s 'http://127.0.0.1:19400/history?errors=true&payload=true&pretty'
# Check error logs
curl -s 'http://127.0.0.1:19400/log?level=error&data=true&pretty'
```

### Monitor a feature's activity

```bash
# See all commands/events for a feature
curl -s 'http://127.0.0.1:19400/history?name=tabs:*&payload=true&pretty'
# Check its current state
curl -s 'http://127.0.0.1:19400/state/tabs?pretty'
```

## Tips

- Use `?pretty` on all GET requests for readable output
- Pipe through `jq` for filtering/transforming JSON
- The `name` glob only supports trailing `*` (prefix match), not full glob syntax
- `level=warn` returns warn AND error entries (filters >=)
- Payloads/data are excluded by default to keep responses small; opt in with `payload=true` or `data=true`
- History and log are ring buffers — oldest entries are evicted when full

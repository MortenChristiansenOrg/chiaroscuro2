---
name: debug-app
description: Inspect Chiaroscuro feature state, native targets, command/event history and debug logs through its local HTTP server. Use for diagnosing app behavior or preparing verification scenarios.
---

# Inspect the browser

Prefer `bun run agent:app` for isolated verification. Its `state`, `targets`,
`commands`, `event-cursor`, `wait-event` and `setup-command` actions wrap the
existing HTTP debug server, managing the random port and bearer token privately.
Read [agent verification](../../../docs/testing/agent-verification.md) for the
shared launch/restart workflow and evidence bundles.

For an existing personal development app the server binds `127.0.0.1`, defaults
to port 19400 and can try consecutive ports. Settings > Developer controls it.
Do not assume a personal app's fixed port is an isolated test instance. Automation
requires a per-session bearer token. Requests with an Origin header or a Host
other than localhost/127.0.0.1 are rejected; browser CORS access is not supported.

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Actual port, uptime, providers and available endpoints |
| `GET /state` | All state; optional `features` and `fields` query filters |
| `GET /state/{feature}` | One provider, e.g. `tabs`, `sub-tabs`, `targets`, `window` |
| `GET /commands` | Registered command names |
| `POST /commands/send` | `{name, payload}`; setup/diagnosis, not UI verification |
| `GET /history` | Recorded commands, responses, errors, events and registrations |
| `GET /log` | Bounded application debug log |
| `DELETE /history`, `DELETE /log` | Clear the respective diagnostic buffer |

Use `?pretty` for readable JSON. History supports `name` (trailing `*` glob),
`type`, `since`, `until`, `errors=true`, `payload=true`, `order` and `limit`.
Logs support `level`, `source`, `since`, `until`, `data=true`, `order` and `limit`.
Request payloads only when needed, since they can include document data.

Command names are not runtime contracts. Read the feature's `.shared.ts` for
payload/response types; issue #44's schema migration is still separate. Existing
HTTP/IPC payload validation is incomplete. Observe results and feature state,
and never use internal commands as evidence that an edited UI interaction works.

Use a history cursor before an action, then a bounded `wait-event` or condition
assertion. Avoid fixed sleeps and do not retry mutations while waiting for effects.
When an assertion fails, capture the target inventory, state, history, logs and
actual visuals before stopping the owned session.

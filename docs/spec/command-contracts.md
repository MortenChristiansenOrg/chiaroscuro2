# Runtime command contracts

Each feature owns `<feature>.contracts.ts`: Zod payload and response schemas,
command descriptions, example payloads, and side effects. Its `.shared.ts` exports
command-name constants and derives the existing TypeScript types from those
schemas. Runtime contracts remain in the main bundle; renderer imports of their
types are erased.

To add a command:

1. Export its name constant from the feature's `.shared.ts`.
2. Add it to the feature's `commandContracts` with `defineCommand(payloadSchema,
   responseSchema, { description, examples, sideEffects })`. Use strict objects,
   explicit optional fields, finite numbers, and bounded/enumerated values when
   required by the feature. Reuse ID and geometry schemas from `shared/types.contracts.ts`.
3. Derive the feature registry with `CommandTypes<typeof commandContracts>`.
   Derive any public payload alias with `z.infer<typeof PayloadSchema>`; do not
   maintain an equivalent hand-written interface. The registry retains both schema
   `input` and validated `payload` types. `IpcRendererCommandBus.send` accepts input
   (including omitted defaulted fields); internal `CommandBus.send` and handlers
   require output because trusted sends bypass boundary validation.
4. For a new feature, include its contracts in `bus/command-contracts.ts`. Register
   the ordinary typed handler on the bus. Both boundaries fail closed for handlers
   without a contract. Internal trusted sends retain the existing typed API.
5. Supply a useful example that parses, document relevant disk/network/clipboard/
   process/window changes, and add behavior tests for meaningful restrictions.

`executeExternalCommand` validates before calling `CommandBus.send`. Rejected
payloads never invoke a handler or enter the command execution recorder. Both the
IPC bridge and `POST /commands/send` use this function. Zod types drive TypeScript
inference and first-party JSON Schema export; no parallel JSON Schema is maintained.

Settings retain incomplete search-provider rows during editing. Their bang fields
therefore permit draft strings; only complete `!word` keywords participate in bang
resolution. Discovery examples use a complete keyword and matching default bang.

## Payload and error conventions

A no-payload command uses `z.undefined()`. External callers may omit `payload` or
send JSON `null`; the handler receives `undefined`. An empty object is rejected.
Optional object fields may be omitted; explicit `undefined` properties from IPC
are removed like JSON serialization. Required fields still fail validation.

Payloads must be finite JSON values. Dates, Maps, typed arrays/binary data, bigint,
functions, symbols, cycles, array holes/undefined elements, and accessors are
rejected instead of being silently serialized into a different value. Nesting is
limited to 100 levels. HTTP request bodies are limited to 1 MiB and malformed JSON
receives 400. PDF bytes already travel as base64 strings.

Validation errors have `code`, `message`, `command`, and `issues` (each with a
property/index `path`, Zod-style `code`, and actionable `message`). They do not echo
payload values. Codes are `INVALID_COMMAND`, `INVALID_PAYLOAD`, `UNKNOWN_COMMAND`,
`FORBIDDEN`, or `COMMAND_FAILED`. HTTP returns `{ error }` with 400, 404, 403, or 500
as appropriate. Successful HTTP calls retain `{ response }`; a void response omits
that property. IPC transports `{ ok, response }` or `{ ok: false, error }` and the
preload preserves the public `sendCommand` API by returning the response or
rejecting with the structured error object. Electron would discard custom fields
on an Error instance, so callers should inspect this plain error object's fields.

## Discovery and authorization

`GET /commands` retains the `commands` name list and adds `contracts` for registered
handlers. Each entry includes descriptions, examples, side effects, and payload and
response JSON Schema. `acceptsOmitted` documents undefined values; no-payload schema
uses JSON null to describe the external convention. Types that cannot be represented
are explicitly marked with `schema: null` and an explanation, never a misleading
unrestricted `{}`. Schema/example tests cover every shipped contract.

Validation does not authorize callers. IPC accepts only the main frame of the
app-owned shell, command palette, and sub-tab frame windows, excluding ordinary web
tabs, popups, and subframes. HTTP retains loopback binding, Host and Origin checks,
and the automation bearer token. An invalid or missing token is rejected before
command validation. Native verification exercises both external boundaries and
checks that invalid navigation cannot change tab state.

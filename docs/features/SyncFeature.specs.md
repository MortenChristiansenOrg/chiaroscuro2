# Specification for Sync Feature

## Overview

Sync keeps domain customizations the same on every machine the user connects: domain CSS
and whether it is enabled, domain navigation rules, and website scripts. It uses the
user's own deployment of the neighbouring `app-data-service` project, a private store of
JSON documents with revisions. Sync is optional and off until a machine is connected.

## Terminology

- **Service**: The user's app-data-service deployment, addressed by its HTTP actions origin
  (`https://….convex.site`). The browser uses the application name `chiaroscuro2`.
- **Key**: A per-machine key (`ads_…`) created in the service's admin page. Keys are
  read/write or read-only and can expire or be revoked there.
- **Item**: One synced thing, stored as one document: a domain's customization (namespace
  `domains`, key = hostname) or a website script (namespace `scripts`, key = script id).
- **Base**: The version of an item this machine last agreed with the service, with its revision.

## Requirements

- Settings → Sync connects a machine with the service URL and its key. The key is checked
  with the service before it is saved, then stored encrypted with the OS keyring in the
  main process (a plain-text keyring fallback is refused). It never reaches web pages or
  the renderer again. Disconnect deletes the key and the sync history; local data stays.
- Local data stays the source of truth, and the browser works the same offline. Local
  changes sync about two seconds after they happen; other machines' changes arrive within
  about a minute, at startup and on Sync now.
- Each run compares every item's local version, base and service version:
  - Changed only here: uploaded with the base revision.
  - Changed only on the service: applied locally, re-injecting CSS and rebinding shortcuts.
  - Changed on both: properties changed on only one side merge. A property changed
    differently on both sides, or an edit on one side and removal on the other, is a
    conflict. The local version stays in use and nothing is uploaded or applied for it
    until the user chooses "Keep this machine's version" or "Use the other machine's
    version". Choosing is refused if either version changed since it was shown, including
    when the same conflict was already settled.
- Removing an item removes it everywhere. The service keeps removals as tombstones, so a
  machine that was offline and didn't change the item removes it too instead of restoring
  it. An item created on a machine that never synced it is uploaded even if an earlier
  item with the same key was removed elsewhere.
- Another machine's version is applied only if the local item is still the version the
  run read, so an edit made during a run is never overwritten; it syncs on the next run.
  It is saved to disk before sync counts it as synced; when saving fails, the local item is
  put back and the change is retried on the next run.
- Local data that can't be read stops the run instead of reading as removed: an unreadable
  stylesheet, or a settings file that couldn't be read at startup. In the latter case the
  store keeps the file as `settings.json.unreadable-<time>`, and sync forgets its history,
  so the next run brings everything back from the service and removes nothing anywhere.
- If the service seems to have forgotten a document or gone back to an older revision (a
  restored backup, another account behind the same address), the item syncs as if for the
  first time, which never removes anything.
- A synced script never moves to another domain, as when editing it locally; a version
  that does is reported instead of applied.
- Runs, conflict choices and disconnecting take turns. Disconnecting aborts requests in
  flight, and nothing changes or saves after it.
- A write rejected because another machine wrote first (`409 REVISION_CONFLICT`) is
  reconciled again with the newer version. An item that keeps changing waits for the next
  run after three attempts, without holding up the others.
- The browser has no size limit of its own. When the service refuses an item as too large
  (`413`), the item stays on this machine and Settings shows the service's own message.
  The same version isn't uploaded again; a changed version is.
- A read-only key downloads changes; Settings explains that local changes aren't uploaded.
- Settings shows Syncing…, Last synced with its time, the most recent failure with its time
  and guidance (unreachable service, rejected or revoked key, key for another application,
  service errors), and every item that needs attention.
- A document saved by a newer browser version (`schemaVersion` above this browser's) or
  that fails validation is reported, never misread or overwritten.

## Documents

Documents carry `schemaVersion: 1`.

- `domains/<hostname>`: `{ schemaVersion, domain, css: string | null, enabled, navigation:
  { blockNavigate, blockRedirect, blockFrameNavigate, blockNewTabs, blockNewWindows } }`,
  the same shape as the service's `client/chiaroscuro.ts` adapter. A domain without a
  stylesheet, enabled CSS or navigation rules has no document (or a tombstone).
- `scripts/<id>`: `{ schemaVersion, ...DomainScript }` with every field present.

The AI "Restore previous CSS" snapshot stays local.

## Trust

Every machine with a read/write key for the user's account can add or change website
scripts, and synced scripts run on this machine like local ones, including automatic
page-load scripts. Scripts don't need confirming per machine because only the user's own
keys reach the data. Use a read-only key on a machine that should only receive changes,
and revoke a lost machine's key in the service.

## Storage

`<data>/sync/credentials.enc` holds the encrypted service URL and key. `<data>/sync/state.json`
holds each item's base and revision, and the last successful sync, for one service URL and
key (identified by a hash, never the key itself). Connecting with another service or key
starts afresh, which never loses local data. Service error messages have the key removed,
and the debug server's command history redacts it.

## Commands and events

`sync:get-state`, `sync:connect`, `sync:disconnect`, `sync:now`, `sync:resolve` (contracts in
`src/features/sync/sync.contracts.ts`); `sync:changed` carries the state shown in Settings.

## Components

- [SyncSettingsSection](../../src/features/sync/SyncSettingsSection.tsx)
- [SyncIssueList](../../src/features/sync/SyncIssueList.tsx)

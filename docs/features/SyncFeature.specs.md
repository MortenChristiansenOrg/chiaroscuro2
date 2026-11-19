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
  the renderer again. The first sync then runs in the background. Disconnect asks first,
  then deletes the key and the sync history; local data stays.
- Local data stays the source of truth, and the browser works the same offline. Local
  changes sync about two seconds after the last of a burst of edits (at most ten seconds
  after the first); changes this machine just applied from the service don't start a run.
  Other machines' changes arrive within about a minute, at startup and on Sync now. While
  the service can't be reached, automatic syncs back off, doubling up to every 15 minutes.
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
  it. A machine without sync history for an item (first connection, or reconnecting with
  a new key) that still has an item removed elsewhere shows a conflict ("Still on this
  machine, but removed on another") instead of restoring it or removing it.
- Another machine's version is applied only if the local item is still the version the
  run read, so an edit made during a run is never overwritten; it syncs on the next run.
  It is saved to disk before sync counts it as synced; when saving fails, the local item is
  put back and the change is retried on the next run.
- Local data that can't be read stops the run instead of reading as removed: an unreadable
  stylesheet (including a dangling link), or a settings file that couldn't be read at
  startup. In the latter case the store keeps the file as
  `settings.json.unreadable-<time>-<id>` and records the loss in `settings.unreadable`
  until sync has forgotten its history, at the next start, even if the key can't be read
  then. The next run brings everything back from the service and removes nothing anywhere.
- Each service holds a `meta/history` document with a random id, created by the first
  machine that syncs. A machine that finds a different id, or none, forgets its history:
  the service was reset or restored, or another account answers at that address. Items
  then sync as if for the first time, which never removes anything. A document that went
  missing, back to an older revision, or changed without a new revision does the same for
  that item.
- A synced script never moves to another domain, as when editing it locally, even after it
  was removed here: sync remembers the last version before a removal. A version that does
  is reported instead of applied.
- Domains that aren't plain hostnames don't sync.
- Runs, conflict choices and disconnecting take turns. Disconnecting aborts requests in
  flight, including a connection attempt still checking its key, and nothing changes or
  saves after it. A conflict choice names both versions as shown (and the service's history
  id) and is refused if the service's document differs in any way.
- A write rejected because another machine wrote first (`409 REVISION_CONFLICT`) is
  reconciled again with the newer version. An item that keeps changing waits for the next
  run after three attempts, without holding up the others.
- The browser has no size limit of its own. When the service refuses an item as too large
  (`413`), the item stays on this machine and Settings shows the service's own message.
  The same version isn't uploaded again; a changed version is.
- A read-only key downloads changes; once the service refuses a write, this is remembered
  and Settings explains that local changes aren't uploaded.
- Settings shows a status line (Loading…, Not connected, Connecting…, Connected, Syncing…
  for syncs the user started, or Sync isn't working right now), Last synced and Last failed
  with their times, one alert with guidance (unreachable service, rejected or revoked key,
  key for another application, read-only key, service errors), and every item that needs
  attention. Background syncs don't change the status line, so screen readers aren't
  interrupted every minute; the main process only notifies windows when this changes.
- Service responses are validated before use; a malformed response, or paging that doesn't
  move forward, stops the run with an error.
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

# Specification for Permission Requests Feature

## Overview

Handles browser permission requests from websites (geolocation, camera, microphone, notifications, etc.). When a site requests a permission, a modal dialog appears above the tab content. Decisions persist per-domain via DataStore and are reviewable/revocable in the domain settings page. Default policy: deny all unless explicitly allowed.

Also renames the existing `app:domain-css` built-in page to `app:domain-settings`, making it a general-purpose domain customization page with sections for CSS and permissions.

## Terminology

- **Permission**: A browser capability a website can request (geolocation, media, notifications, etc.).
- **Permission decision**: A stored allow/deny choice for a specific domain + permission type pair.
- **Permission prompt**: The modal dialog shown when a site requests an undecided permission.
- **Domain settings page**: The built-in page (formerly domain-css) for per-domain customization.

## Requirements

- Intercept all Electron permission requests via `session.setPermissionRequestHandler`.
- Intercept permission checks via `session.setPermissionCheckHandler`.
- If a stored decision exists for the domain + permission type, use it immediately (no prompt).
- When a permission is requested and no decision exists, show a native prompt dialog with the requesting domain, the permission type (human-readable), and Allow/Deny buttons.
- Allow/Deny decisions are persisted per-domain via DataStore.
- The domain settings page shows a "Permissions" section listing all stored decisions for that domain.
- Each permission in the list can be toggled (allow↔deny) or revoked (removed, returning to default deny).
- Revoking a permission removes the stored decision; next request will prompt again.
- Permission state changes emit events so the renderer store stays in sync.
- The `domain-css:open` command and `app:domain-css` route are renamed to `domain-settings:open` / `app:domain-settings`.

## Workflows

### Permission requested by website

1. Website calls a permission-requiring API (e.g., `navigator.geolocation.getCurrentPosition()`).
2. Electron fires `setPermissionRequestHandler` in main process.
3. Main checks DataStore for existing decision for this domain + permission.
4. If stored → callback with stored decision (allow=true, deny=false). Done.
5. If not stored → main shows a native prompt dialog via `showPermissionPrompt(domain, label)`.
6. User clicks Allow or Deny in the native dialog.
7. Main stores decision, calls Electron callback, emits `permissions:changed` event.

### Review permissions in domain settings

1. Open domain settings page (via address bar icon or `domain-settings:open` command).
2. "Permissions" section lists all stored decisions for the domain.
3. Each row shows: permission type icon, human-readable name, current state (Allowed/Denied).
4. User can toggle a permission (switch between allow/deny).
5. User can revoke a permission (remove the stored decision entirely).

### Revoke a permission

1. In domain settings, click "Revoke" on a permission.
2. Stored decision removed from DataStore.
3. `permissions:changed` event emitted.
4. Next time the site requests this permission, user will be prompted again.

## Interactions

### Keyboard shortcuts

- **Escape**: Dismiss the permission prompt (equivalent to Deny).

### Mouse interactions

- **Allow button**: Grant the permission and persist the decision.
- **Deny button**: Deny the permission and persist the decision.
- **Toggle in domain settings**: Switch a stored decision between allow/deny.
- **Revoke in domain settings**: Remove the stored decision.

### Cross-feature interactions

- **Domain CSS**: Shares the domain settings built-in page. CSS controls remain as a section.
- **Tabs**: Needs active tab's domain to resolve permission requests. Listens to tab events.
- **Window Chrome**: The address bar icon opens `app:domain-settings` (renamed from `app:domain-css`).

## Commands & Events

### Commands

- `permissions:set` — Set a permission decision for a domain. Payload: `{ domain: string, permission: string, decision: 'allow' | 'deny' }`.
- `permissions:revoke` — Remove a stored permission decision. Payload: `{ domain: string, permission: string }`.
- `permissions:get-domain-permissions` — Get all stored decisions for a domain. Payload: `{ domain: string }`. Response: `{ domain: string, permissions: Record<string, 'allow' | 'deny'> }`.
- `domain-settings:open` — Open domain settings tab for a domain (renamed from `domain-css:open`). Payload: `{ domain: string }`.

### Events

- `permissions:changed` — Permission decisions changed for a domain. Payload: `{ domain: string, permissions: Record<string, 'allow' | 'deny'> }`.

## Unresolved Issues

- Should `setPermissionCheckHandler` also trigger prompts, or only `setPermissionRequestHandler`? Check handlers are synchronous and cannot await user input — likely just use stored decisions or deny.
- Should permission decisions apply to all tabs on a domain, or per-tab? Per-domain is simpler and matches browser conventions.
- Should there be a way to bulk-revoke all permissions for a domain?

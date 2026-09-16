# Extensions: Bitwarden password support

## Release boundary

The supported extension is the official Manifest V3 Bitwarden Chrome Web Store package. Electron remains the browser runtime. A reusable in-house compatibility layer supplies missing browser semantics; Bitwarden owns its UI, encryption, vault, authentication and synchronization. Vendor JavaScript is not patched.

Supported workflows are password/authenticator-code sign-in to cloud and self-hosted vaults, sync, lock/unlock, password generation, saving/editing passwords, and popup filling in the selected tab and ordinary embedded login forms.

## Installation and management

- The built-in `/extensions` page offers Bitwarden directly; it does not scrape or advertise an unrestricted store catalog.
- Downloads are staged and authenticated with CRX3 developer and Chrome Web Store signatures before extraction. Extraction rejects unsafe paths, special files, duplicates and excessive sizes.
- Initial installation executes no code before explicit permission approval. Approval identifies the exact reviewed package. Existing installations missing approval must also be reviewed before loading.
- Installed cards display branding, version, actual running state, enable control, update state and actionable errors. Disabled branding survives restart.
- Disable unloads extension code and closes its popup. Uninstall requires confirmation, removes installed/staged code and retains native local vault storage for reinstall. The UI states that policy explicitly.

## Updates and recovery

- Check at startup and every four hours, including disabled extensions. A manual check is available.
- Use the running Chromium version and the official store version-check endpoint. Download full packages only when an update is offered.
- Retain stable unpacked paths and manifest identity so native storage survives updates. Reject identity changes and versions requiring newer Chromium.
- Stage updates during normal use and activate at the next complete browser start. Updates cannot interrupt an open vault.
- Expanded permissions require approval before activation; declining leaves existing code in place.
- Persist a transaction journal before swapping package directories. Failed native loading or interrupted activation restores previous code and metadata. Local vault data is not rolled back or replaced.
- Report failed activation and permit a manual retry. Automatic checks may accept a subsequent newer release instead of repeatedly activating the same failed version.
- Surface network, disk, invalid-package and compatibility errors. Never claim a failed check means the extension is current.

## Compatibility and isolation

- Extension documents execute at `chrome-extension://` with sandboxing and context isolation; no local-website wrapper or replacement vault.
- Native local storage persists, native session storage remains in memory. Relay storage invalidations to MV3 workers where Electron omits events.
- Route browser APIs using native tab IDs and the selected content view. Restrict adapter IPC to authenticated loaded extension frames/workers and filter metadata by granted permissions.
- Optional permissions are denied unless already granted; required new grants use the management page. Managed policy storage is empty and read-only.
- Future Bitwarden releases can require maintenance. Visible failures, disable/removal and retry are part of this release, not deferred features.

## Deferred

Inline suggestions, automatic filling on page load and extension keyboard shortcuts are tracked in [issue #64](https://github.com/MortenChristiansenOrg/chiaroscuro2/issues/64).

Other exclusions: general Chrome extension compatibility, alternate stores/sideloading, passkeys, native messaging/biometrics, enterprise SSO, side panels/browser overrides/themes, browser-level extension settings sync and a custom Bitwarden client.

## Verification

Package and lifecycle tests cover trust, traversal, permission approval, stable identity, staged updates, disabled updates, recovery and vault retention. The sandboxed Electron scenario runs on Linux and Windows and verifies native worker storage, active-tab scripting, metadata denial and restart behavior. See implementation.md section 6 for real Bitwarden acceptance evidence and limits.

References: [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions/), [Chrome update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle), [CRX3 format](https://github.com/chromium/chromium/blob/main/components/crx_file/crx3.proto).

## Built-in page and installation UI

Extensions follows Settings' built-in page identity: a human-readable title and custom favicon, one tab per workspace, and a single named palette entry. Internal page URLs are never recorded as visits; historic internal entries are excluded from search results. Shared metadata lives in `src/shared/built-in-pages.ts`.

Bitwarden has a bundled icon before installation. “Review and install” starts a download into the same card, explains that approval is required, and presents readable permission descriptions with expandable exact names. “Approve and install” explicitly grants the reviewed access; “Cancel installation” discards the staged package. Failures offer retry. Installed cards provide Open Bitwarden, a keyboard-accessible enable switch, automatic update status and removal confirmation.

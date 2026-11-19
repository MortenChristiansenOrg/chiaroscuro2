import { type FormEvent, useId, useRef, useState } from "react";
import {
  SettingItem,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import { scriptErrorMessage, scriptInputClass } from "../domain-scripts/domain-scripts.ui";
import { type ConflictChoice, SyncIssueList, syncButtonClass } from "./SyncIssueList";
import type { SyncIssue, SyncState } from "./sync.shared";
import { useSyncStore } from "./sync.store";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Settings → Sync: connect this machine to the app data service and see how sync is going. */
export function SyncSettingsSection({ state: shown }: { state?: SyncState } = {}) {
  const stored = useSyncStore((s) => s.state);
  const loaded = useSyncStore((s) => s.loaded);
  // Previews pass a state; the app always uses the store.
  const state = shown ?? stored;
  const ready = shown !== undefined || loaded;
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const id = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const issuesRef = useRef<HTMLHeadingElement>(null);
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** Swap the Disconnect row and its confirmation, moving focus into what replaced it. */
  const confirm = (open: boolean) => {
    setConfirming(open);
    requestAnimationFrame(() => (open ? cancelRef : disconnectRef).current?.focus());
  };

  /** Run a command unless one is running; focus stays put, as no control is disabled. */
  async function send(name: string, payload: unknown = {}) {
    if (busy) return false;
    setError(undefined);
    setBusy(name);
    try {
      await window.chiaroscuro.sendCommand(name, payload);
      return true;
    } catch (error) {
      setError(scriptErrorMessage(error));
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (await send("sync:connect", { url, apiKey })) {
      setApiKey("");
      // The form is gone; the status line says what happened.
      requestAnimationFrame(() => statusRef.current?.focus());
    } else urlRef.current?.focus();
  }

  async function disconnect() {
    await send("sync:disconnect");
    // Stopped, even if cleaning up afterwards failed: the form replaces the confirmation.
    // Otherwise the confirmation stays, with the alert, to try again.
    if (!useSyncStore.getState().state.connected) {
      setConfirming(false);
      requestAnimationFrame(() => urlRef.current?.focus());
    }
  }

  async function resolve(issue: SyncIssue, keep: ConflictChoice) {
    await send("sync:resolve", { id: issue.id, keep, version: issue.version ?? "" });
    requestAnimationFrame(() => (issuesRef.current ?? statusRef.current)?.focus());
  }

  // Only changes the user caused are announced: background syncs keep the same text.
  const status = !ready
    ? "Loading…"
    : busy === "sync:connect"
      ? "Connecting…"
      : !state.connected
        ? "Not connected"
        : state.syncing
          ? "Syncing…"
          : state.error
            ? "Sync isn't working right now"
            : "Connected";
  const alert = error ?? state.error;
  const muted = "m-0 text-[var(--content-text-secondary)]";

  return (
    <section id="settings-sync">
      <h2 style={settingsCategoryHeadingStyle}>Sync</h2>
      <SettingItem
        label="Sync between machines"
        description="Keep domain styles, navigation rules and website scripts the same on every machine connected to your app data service. Scripts that come from your other machines run here like scripts you add yourself."
      >
        <div className="flex flex-col gap-3 text-[length:var(--text-sm)]">
          <div className="flex flex-col gap-1">
            <p ref={statusRef} tabIndex={-1} role="status" className="m-0 outline-none">
              {status}
            </p>
            {ready && state.connected && (
              <>
                <p className={`${muted} break-all`}>Service: {state.serviceUrl}</p>
                <p className={muted}>
                  {state.lastSyncedAt
                    ? `Last synced ${timeFormat.format(state.lastSyncedAt)}`
                    : "Not synced yet"}
                  {state.lastFailedAt && ` · Last failed ${timeFormat.format(state.lastFailedAt)}`}
                </p>
                {state.readOnly && (
                  <p className={muted}>
                    This machine's key can only read. Changes made here aren't uploaded.
                  </p>
                )}
              </>
            )}
          </div>
          {alert && (
            <p role="alert" className="m-0 text-[var(--destructive)]">
              {alert}
            </p>
          )}
          {ready && state.connected && !confirming && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={syncButtonClass}
                aria-disabled={!!busy || state.syncing}
                onClick={() => {
                  if (!state.syncing) void send("sync:now");
                }}
              >
                Sync now
              </button>
              <button
                ref={disconnectRef}
                type="button"
                className={syncButtonClass}
                onClick={() => confirm(true)}
              >
                Disconnect
              </button>
            </div>
          )}
          {ready && state.connected && confirming && (
            // biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the row
            <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-confirm`}>
              <p id={`${id}-confirm`} className="m-0">
                Stop syncing on this machine? Your customizations stay here. To connect again you'll
                need a new key.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={syncButtonClass}
                  aria-disabled={!!busy}
                  onClick={() => void disconnect()}
                >
                  Stop syncing
                </button>
                <button
                  ref={cancelRef}
                  type="button"
                  className={syncButtonClass}
                  onClick={() => confirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {ready && !state.connected && (
            <form className="flex flex-col gap-2" onSubmit={(event) => void connect(event)}>
              <label className="flex flex-col gap-1">
                Service URL
                <input
                  ref={urlRef}
                  className={scriptInputClass}
                  type="url"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://your-deployment.convex.site"
                  aria-describedby={`${id}-help`}
                  aria-invalid={!!error}
                  readOnly={!!busy}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                Key for this machine
                <input
                  className={scriptInputClass}
                  type="password"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ads_…"
                  aria-describedby={`${id}-help`}
                  aria-invalid={!!error}
                  readOnly={!!busy}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <p id={`${id}-help`} className={muted}>
                Your app data service stores customizations for your machines. Create a key for this
                machine in its admin page, for the application chiaroscuro2. The key is stored
                encrypted on this machine.
              </p>
              <div>
                <button type="submit" className={syncButtonClass} aria-disabled={!!busy}>
                  Connect
                </button>
              </div>
            </form>
          )}
          <SyncIssueList
            issues={state.issues}
            busy={!!busy}
            headingRef={issuesRef}
            onResolve={(issue, keep) => void resolve(issue, keep)}
          />
        </div>
      </SettingItem>
    </section>
  );
}

import { type FormEvent, useState } from "react";
import {
  SettingItem,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import {
  scriptButtonClass,
  scriptErrorMessage,
  scriptInputClass,
} from "../domain-scripts/domain-scripts.ui";
import { type ConflictChoice, SyncIssueList } from "./SyncIssueList";
import type { SyncState } from "./sync.shared";
import { useSyncStore } from "./sync.store";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Settings → Sync: connect this machine to the app data service and see how sync is going. */
export function SyncSettingsSection({ state: shown }: { state?: SyncState } = {}) {
  const stored = useSyncStore((s) => s.state);
  // Previews pass a state; the app always uses the store.
  const state = shown ?? stored;
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function send(name: string, payload: unknown = {}) {
    setError(undefined);
    setBusy(true);
    try {
      await window.chiaroscuro.sendCommand(name, payload);
      return true;
    } catch (error) {
      setError(scriptErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (await send("sync:connect", { url, apiKey })) setApiKey("");
  }

  const resolve = (id: string, keep: ConflictChoice) => void send("sync:resolve", { id, keep });

  return (
    <section id="settings-sync">
      <h2 style={settingsCategoryHeadingStyle}>Sync</h2>
      <SettingItem
        label="Sync between machines"
        description="Keep domain styles, navigation rules and website scripts the same on every machine connected to your app data service. Scripts that come from your other machines run here like scripts you add yourself."
      >
        <div className="flex flex-col gap-3 text-[length:var(--text-sm)]">
          {state.connected ? (
            <>
              <p className="m-0" role="status">
                {state.syncing
                  ? "Syncing…"
                  : state.lastSyncedAt
                    ? `Last synced ${timeFormat.format(state.lastSyncedAt)}`
                    : "Not synced yet"}
              </p>
              <p className="m-0 break-all text-[var(--muted-foreground)]">
                Connected to {state.serviceUrl}
              </p>
              {state.readOnly && (
                <p className="m-0 text-[var(--muted-foreground)]">
                  This machine's key can only read. Changes made here aren't uploaded.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={scriptButtonClass}
                  disabled={busy || state.syncing}
                  onClick={() => void send("sync:now")}
                >
                  Sync now
                </button>
                <button
                  type="button"
                  className={scriptButtonClass}
                  disabled={busy}
                  onClick={() => void send("sync:disconnect")}
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={(event) => void connect(event)}>
              <label className="flex flex-col gap-1">
                Service URL
                <input
                  className={scriptInputClass}
                  type="url"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://your-deployment.convex.site"
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
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <p className="m-0 text-[var(--muted-foreground)]">
                Create a key for this machine in the service's admin page, for the application
                chiaroscuro2. The key is stored encrypted on this machine.
              </p>
              <div>
                <button type="submit" className={scriptButtonClass} disabled={busy}>
                  {busy ? "Connecting…" : "Connect"}
                </button>
              </div>
            </form>
          )}
          {state.error && !error && (
            <p role="alert" className="m-0 text-[var(--destructive)]">
              {state.error}
              {state.lastFailedAt && ` (${timeFormat.format(state.lastFailedAt)})`}
            </p>
          )}
          {error && (
            <p role="alert" className="m-0 text-[var(--destructive)]">
              {error}
            </p>
          )}
          <SyncIssueList issues={state.issues} disabled={busy} onResolve={resolve} />
        </div>
      </SettingItem>
    </section>
  );
}

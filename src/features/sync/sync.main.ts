import { createHash } from "node:crypto";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { CredentialProtection } from "../../shared/credential-protection";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import {
  DOMAIN_CSS_CHANGED,
  DOMAIN_NAVIGATION_CHANGED,
  type DomainCssEvents,
} from "../domain-css/domain-css.shared";
import {
  DOMAIN_SCRIPTS_CHANGED,
  type DomainScriptsEvents,
} from "../domain-scripts/domain-scripts.shared";
import {
  AppDataError,
  createAppDataClient,
  normalizeServiceUrl,
  SYNC_APPLICATION,
  validateApiKey,
} from "./app-data-client.main";
import {
  DISCONNECTED_SYNC_STATE,
  SYNC_CHANGED,
  type SyncCommands,
  type SyncEvents,
  type SyncState,
} from "./sync.shared";
import { SyncEngine, type SyncSource } from "./sync-engine.main";
import { createSyncFiles } from "./sync-files.main";

type AllEvents = SyncEvents &
  Pick<DomainCssEvents, typeof DOMAIN_CSS_CHANGED | typeof DOMAIN_NAVIGATION_CHANGED> &
  Pick<DomainScriptsEvents, typeof DOMAIN_SCRIPTS_CHANGED>;

export interface SyncDeps {
  commands: CommandBus<SyncCommands>;
  events: EventBus<AllEvents>;
  /** Holds the encrypted key and what this machine last agreed with the service. */
  directory: string;
  protection: CredentialProtection;
  sources: SyncSource[];
  fetch?: typeof fetch;
  /** How often to look for other machines' changes. */
  pollIntervalMs?: number;
  /** How long to wait after a local change, so a burst of edits syncs once. */
  changeDelayMs?: number;
  /** True when this machine's saved settings couldn't be read, until acknowledged. */
  localDataUnreadable?: () => boolean;
  /** Called once sync history was reset because local data was lost. */
  acknowledgeLocalDataUnreadable?: () => void;
  now?: () => number;
}

/**
 * Turn a failed run or connection check into guidance for the user. A failed connect isn't
 * retried, so it doesn't promise that.
 */
export function describeSyncError(error: unknown, connecting = false): string {
  if (error instanceof AppDataError) {
    if (error.code === "NETWORK")
      return connecting
        ? "Couldn't reach the sync service. Check the address and try again."
        : "Couldn't reach the sync service. Changes stay on this machine and sync once it can be reached.";
    if (error.status === 401)
      return "The sync service didn't accept this machine's key. It may have expired or been revoked. Disconnect, then connect again with a new key.";
    if (error.code === "APPLICATION_MISMATCH")
      return `This key is for a different application. Create a key for the application “${SYNC_APPLICATION}”.`;
    if (error.code === "READ_ONLY")
      return "This machine's key can only read, so changes made here can't be uploaded.";
    if (error.status === 403)
      return "The sync service refused this machine's key. Disconnect, then connect again with a new key.";
    if (error.status >= 500 || error.status === 0)
      return connecting
        ? "The sync service had a problem. Try connecting again later."
        : "The sync service had a problem. Sync tries again automatically.";
    return `The sync service refused the request: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Sync history is kept per service address and key, never the key itself. */
function historyId(url: string, apiKey: string): string {
  return `${url}#${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

let cleanup: (() => void) | undefined;
let begin: (() => Promise<void>) | undefined;

export default defineFeature<SyncDeps, void>({
  register(deps) {
    cleanup?.();
    const { commands, events, sources } = deps;
    const files = createSyncFiles(deps.directory, deps.protection);
    const now = deps.now ?? Date.now;
    let state: SyncState = structuredClone(DISCONNECTED_SYNC_STATE);
    let engine: SyncEngine | undefined;
    let abort: AbortController | undefined;
    // Runs, conflict choices and disconnects take turns, so none acts on another's
    // half-finished work.
    let queue: Promise<unknown> = Promise.resolve();
    let pendingRun: Promise<void> | undefined;
    /** Bumped by every connect and disconnect, so a slower earlier attempt gives up. */
    let attempt = 0;
    let checking: AbortController | undefined;
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    let firstChangeAt: number | undefined;
    let showSyncing = false;
    let failures = 0;
    let nextPollAt = 0;
    let published = "";
    const subscriptions: (() => void)[] = [];
    const pollInterval = deps.pollIntervalMs ?? 60_000;
    const changeDelay = deps.changeDelayMs ?? 2_000;

    function snapshot(): SyncState {
      return structuredClone({
        ...state,
        readOnly: engine?.readOnly ?? false,
        issues: engine?.getIssues() ?? [],
      });
    }

    /** Tell every window, but only when what Settings shows changed. */
    function publish() {
      if (disposed) return;
      state = snapshot();
      const json = JSON.stringify(state);
      if (json === published) return;
      published = json;
      events.emit(SYNC_CHANGED, structuredClone(state));
    }

    function enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const result = queue.then(operation);
      queue = result.catch(() => {});
      return result;
    }

    /**
     * Run soon; requests made before the run starts share it. Only runs the user asked for
     * show Syncing…, so background runs don't keep announcing themselves.
     */
    function sync(userInitiated = false): Promise<void> {
      if (!engine) return Promise.resolve();
      if (userInitiated) showSyncing = true;
      pendingRun ??= enqueue(async () => {
        pendingRun = undefined;
        const current = engine;
        if (!current) return;
        const asked = showSyncing;
        state.syncing = showSyncing;
        showSyncing = false;
        publish();
        try {
          // Asking again retries items the service refused, in case its limits changed.
          await current.run({ retryRefused: asked });
          if (engine !== current) return;
          state.lastSyncedAt = current.state.lastSyncedAt;
          state.error = undefined;
          failures = 0;
          nextPollAt = 0;
        } catch (error) {
          if (engine !== current) return;
          logError("sync", "sync run")(error);
          state.error = describeSyncError(error);
          state.lastFailedAt = now();
          // Try less often while the service stays unreachable, up to every 15 minutes.
          failures++;
          nextPollAt = now() + Math.min(15 * 60_000, pollInterval * 2 ** failures);
        }
        state.syncing = false;
        publish();
      });
      return pendingRun;
    }

    function poll() {
      if (now() >= nextPollAt) void sync();
    }

    /** Sync a local change after a short pause, and at the latest 10 seconds after the first. */
    function syncSoon() {
      if (!engine) return;
      clearTimeout(changeTimer);
      firstChangeAt ??= now();
      const wait = Math.max(0, Math.min(changeDelay, firstChangeAt + 10_000 - now()));
      changeTimer = setTimeout(() => {
        firstChangeAt = undefined;
        let changed = true;
        try {
          // Changes this machine just applied from the service need no run of their own.
          changed = engine?.hasLocalChanges() ?? false;
        } catch {
          // Let the run report why local data couldn't be read.
        }
        if (changed) void sync();
      }, wait);
    }

    /** Stop syncing at once: in-flight requests abort and nothing saves afterwards. */
    function stop() {
      engine?.stop();
      abort?.abort();
      engine = undefined;
      abort = undefined;
      clearInterval(pollTimer);
      clearTimeout(changeTimer);
      pollTimer = undefined;
      changeTimer = undefined;
      firstChangeAt = undefined;
      failures = 0;
      nextPollAt = 0;
    }

    /**
     * Load what this machine last agreed with the service, then replace any current
     * connection with this one, unless `owner` was cancelled meanwhile. Until then, a current
     * connection keeps working. Returns whether it connected.
     */
    async function connectWith(url: string, apiKey: string, owner: number): Promise<boolean> {
      await forgetHistoryIfLocalDataLost();
      // History belongs to one service and key; another key may reach another account.
      const persisted = await files.loadState(historyId(url, apiKey));
      if (owner !== attempt || disposed) return false;
      stop();
      const controller = new AbortController();
      const client = createAppDataClient({
        url,
        apiKey,
        fetch: deps.fetch,
        signal: controller.signal,
      });
      abort = controller;
      engine = new SyncEngine(client, sources, persisted, files.saveState, now);
      state = {
        ...structuredClone(DISCONNECTED_SYNC_STATE),
        connected: true,
        serviceUrl: url,
        lastSyncedAt: persisted.lastSyncedAt,
      };
      pollTimer = setInterval(poll, pollInterval);
      publish();
      return true;
    }

    /**
     * Local data was lost, so what this machine remembers would read as removals and spread
     * them everywhere. Forgetting it makes the next sync bring everything back instead. The
     * store keeps reporting the loss until this has happened, even across restarts.
     */
    async function forgetHistoryIfLocalDataLost() {
      if (!deps.localDataUnreadable?.()) return;
      logError("sync", "local data unreadable")("Forgetting sync history");
      await files.clearHistory();
      deps.acknowledgeLocalDataUnreadable?.();
    }

    // Local edits sync shortly after they happen; other machines' edits arrive with polling.
    for (const name of [DOMAIN_CSS_CHANGED, DOMAIN_NAVIGATION_CHANGED, DOMAIN_SCRIPTS_CHANGED])
      subscriptions.push(events.on(name, syncSoon));

    commands.handle("sync:get-state", async () => snapshot());

    commands.handle("sync:connect", async (payload) => {
      const url = normalizeServiceUrl(payload.url);
      const apiKey = validateApiKey(payload.apiKey);
      const current = ++attempt;
      checking?.abort();
      const controller = new AbortController();
      checking = controller;
      const cancelled = () => new Error("Connecting was cancelled.");
      const client = createAppDataClient({
        url,
        apiKey,
        fetch: deps.fetch,
        signal: controller.signal,
      });
      try {
        // Check the key before saving it, so a typo isn't remembered.
        await client.check(sources[0]?.namespace ?? "default");
      } catch (error) {
        if (current !== attempt) throw cancelled();
        throw new Error(describeSyncError(error, true));
      }
      await enqueue(async () => {
        // A disconnect or another connect since then wins.
        if (current !== attempt || disposed) throw cancelled();
        // Saved first: if the keyring refuses, the current connection stays as it is. A
        // disconnect queued meanwhile deletes it again.
        await files.saveCredentials({ url, apiKey });
        if (!(await connectWith(url, apiKey, current))) throw cancelled();
      });
      // The first sync shows in Settings; Disconnect stays available meanwhile.
      void sync(true);
    });

    commands.handle("sync:disconnect", async () => {
      attempt++;
      checking?.abort();
      stop();
      // Let aborted work finish before deleting history it might still be saving.
      await enqueue(async () => {
        stop();
        await files.removeCredentials();
        // Without the key nothing syncs, even if history can't be deleted below. That history
        // still matches only this service and key, and is checked against the service.
        state = structuredClone(DISCONNECTED_SYNC_STATE);
        publish();
        await files.clearHistory();
      });
    });

    commands.handle("sync:now", async () => {
      if (!engine) throw new Error("Connect to the sync service first.");
      await sync(true);
    });

    commands.handle("sync:resolve", ({ id, keep, version }) =>
      enqueue(async () => {
        const current = engine;
        if (!current) throw new Error("Connect to the sync service first.");
        try {
          await current.resolve(id, keep, version);
        } catch (error) {
          // Show the conflict as it is now.
          void sync();
          throw new Error(describeSyncError(error));
        } finally {
          publish();
        }
      }),
    );

    begin = async () => {
      try {
        const current = attempt;
        // Before anything that could fail, such as a locked keyring.
        await forgetHistoryIfLocalDataLost();
        const credentials = await files.loadCredentials();
        if (!credentials) return;
        await enqueue(async () => {
          // A disconnect or connect made meanwhile wins over the saved connection.
          if (await connectWith(credentials.url, credentials.apiKey, current)) void sync();
        });
      } catch (error) {
        // Sync problems never stop the browser from starting.
        logError("sync", "start")(error);
        state.error = "This machine's saved sync settings couldn't be read. Connect again.";
        publish();
      }
    };

    cleanup = () => {
      disposed = true;
      attempt++;
      checking?.abort();
      stop();
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  },
  async start() {
    await begin?.();
  },
  teardown() {
    cleanup?.();
    cleanup = undefined;
    begin = undefined;
  },
});

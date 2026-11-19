import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import type { CredentialProtection } from "../ai/chatgpt-client.main";
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
  now?: () => number;
}

/** Turn a failed run or connection check into guidance for the user. */
export function describeSyncError(error: unknown): string {
  if (error instanceof AppDataError) {
    if (error.code === "NETWORK")
      return "Couldn't reach the sync service. Changes stay on this machine and sync once it can be reached.";
    if (error.status === 401)
      return "The sync service didn't accept this machine's key. It may have expired or been revoked. Connect again with a new key.";
    if (error.code === "APPLICATION_MISMATCH")
      return `This key is for a different application. Create a key for the application “${SYNC_APPLICATION}”.`;
    if (error.status === 403)
      return "The sync service refused this machine's key. Connect again with a new key.";
    if (error.status >= 500 || error.status === 0)
      return "The sync service had a problem. Sync tries again automatically.";
    return `The sync service refused the request: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
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
    let running: Promise<void> | undefined;
    let again = false;
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    const subscriptions: (() => void)[] = [];

    function publish() {
      if (disposed) return;
      state = {
        ...state,
        readOnly: engine?.readOnly ?? false,
        issues: engine?.getIssues() ?? [],
      };
      events.emit(SYNC_CHANGED, structuredClone(state));
    }

    /** Run once now, or once more after the run in progress. */
    function sync(): Promise<void> {
      if (!engine) return Promise.resolve();
      if (running) {
        again = true;
        return running;
      }
      const current = engine;
      running = (async () => {
        do {
          again = false;
          state.syncing = true;
          publish();
          try {
            await current.run();
            if (engine !== current) return;
            state.lastSyncedAt = current.state.lastSyncedAt;
            state.error = undefined;
          } catch (error) {
            if (engine !== current) return;
            logError("sync", "sync run")(error);
            state.error = describeSyncError(error);
            state.lastFailedAt = now();
          }
        } while (again && engine === current);
        state.syncing = false;
        publish();
      })().finally(() => {
        running = undefined;
      });
      return running;
    }

    function syncSoon() {
      if (!engine) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => void sync(), deps.changeDelayMs ?? 2_000);
    }

    function stop() {
      engine?.stop();
      engine = undefined;
      clearInterval(pollTimer);
      clearTimeout(changeTimer);
      pollTimer = undefined;
      changeTimer = undefined;
    }

    async function connectWith(url: string, apiKey: string) {
      const client = createAppDataClient({ url, apiKey, fetch: deps.fetch });
      const persisted = await files.loadState(url);
      engine = new SyncEngine(client, sources, persisted, files.saveState, now);
      state = {
        ...structuredClone(DISCONNECTED_SYNC_STATE),
        connected: true,
        serviceUrl: url,
        lastSyncedAt: persisted.lastSyncedAt,
      };
      pollTimer = setInterval(() => void sync(), deps.pollIntervalMs ?? 60_000);
      publish();
    }

    // Local edits sync shortly after they happen; other machines' edits arrive with polling.
    for (const name of [DOMAIN_CSS_CHANGED, DOMAIN_NAVIGATION_CHANGED, DOMAIN_SCRIPTS_CHANGED])
      subscriptions.push(events.on(name, syncSoon));

    commands.handle("sync:get-state", async () => {
      publish();
      return structuredClone(state);
    });

    commands.handle("sync:connect", async (payload) => {
      const url = normalizeServiceUrl(payload.url);
      const apiKey = validateApiKey(payload.apiKey);
      const client = createAppDataClient({ url, apiKey, fetch: deps.fetch });
      try {
        // Check the key before saving it, so a typo isn't remembered.
        await client.check(sources[0]?.namespace ?? "default");
      } catch (error) {
        throw new Error(describeSyncError(error));
      }
      await files.saveCredentials({ url, apiKey });
      if (running) await running.catch(() => {});
      stop();
      await connectWith(url, apiKey);
      await sync();
    });

    commands.handle("sync:disconnect", async () => {
      stop();
      await files.clear();
      state = structuredClone(DISCONNECTED_SYNC_STATE);
      publish();
    });

    commands.handle("sync:now", async () => {
      if (!engine) throw new Error("Connect to the sync service first.");
      await sync();
    });

    commands.handle("sync:resolve", async ({ id, keep }) => {
      const current = engine;
      if (!current) throw new Error("Connect to the sync service first.");
      // Settle against the latest versions rather than racing a run.
      if (running) await running;
      try {
        await current.resolve(id, keep);
      } catch (error) {
        // Show the conflict as it is now.
        void sync();
        throw new Error(describeSyncError(error));
      } finally {
        publish();
      }
    });

    begin = async () => {
      let credentials: Awaited<ReturnType<typeof files.loadCredentials>>;
      try {
        credentials = await files.loadCredentials();
      } catch (error) {
        logError("sync", "load credentials")(error);
        state.error = "This machine's saved sync key couldn't be read. Connect again.";
        publish();
        return;
      }
      if (!credentials || disposed) return;
      await connectWith(credentials.url, credentials.apiKey);
      void sync();
    };

    cleanup = () => {
      disposed = true;
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

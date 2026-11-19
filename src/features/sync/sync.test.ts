import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import {
  createFakeAppDataService,
  FAKE_APP_DATA_KEY,
  type FakeAppDataService,
} from "../../test-utils/fake-app-data-service";
import { DOMAIN_CSS_CHANGED } from "../domain-css/domain-css.shared";
import { AppDataError, type JsonValue } from "./app-data-client.main";
import { jsonEqual } from "./merge.main";
import feature, { describeSyncError, type SyncDeps } from "./sync.main";
import { SYNC_CHANGED, type SyncState } from "./sync.shared";
import { LocalChangedError, type SyncSource } from "./sync-engine.main";

const URL = "https://sync.example";
let directory: string | undefined;
afterEach(() => {
  feature.teardown?.();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

// Reversible stand-in for the OS keyring, so tests can see that the file isn't plain text.
const protection = {
  encrypt: vi.fn((value: string) => new TextEncoder().encode([...value].reverse().join(""))),
  decrypt: (value: Uint8Array) => [...new TextDecoder().decode(value)].reverse().join(""),
};

function setup(
  service: FakeAppDataService = createFakeAppDataService(),
  dir?: string,
  overrides: Partial<SyncDeps> = {},
) {
  directory = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sync-feature-"));
  const items = new Map<string, JsonValue>();
  const source: SyncSource = {
    namespace: "domains",
    describe: (key) => `${key} styles`,
    read: () => new Map(items),
    parse: (_key, value) => value,
    async apply(key, value, expected) {
      if (!jsonEqual(items.get(key) ?? null, expected)) throw new LocalChangedError();
      if (value === null) items.delete(key);
      else items.set(key, value);
    },
  };
  const commands = new CommandBus() as SyncDeps["commands"];
  const events = new EventBus() as SyncDeps["events"];
  const states: SyncState[] = [];
  events.on(SYNC_CHANGED, (state) => states.push(state));
  const deps: SyncDeps = {
    commands,
    events,
    directory,
    protection,
    sources: [source],
    fetch: service.fetch,
    pollIntervalMs: 60_000,
    changeDelayMs: 0,
    ...overrides,
  };
  feature.register(deps);
  return { commands, events, items, service, states, directory, deps };
}

const latest = (states: SyncState[]) => states.at(-1);

describe("sync feature", () => {
  it("checks the address and key before contacting the service", async () => {
    const { commands, service } = setup();
    await expect(
      commands.send("sync:connect", { url: "http://sync.example", apiKey: FAKE_APP_DATA_KEY }),
    ).rejects.toThrow("must use HTTPS");
    await expect(commands.send("sync:connect", { url: URL, apiKey: "secret" })).rejects.toThrow(
      "starts with ads_",
    );
    expect(service.requests).toEqual([]);
  });

  it("doesn't save a key the service rejects", async () => {
    const { commands, directory } = setup();
    await expect(
      commands.send("sync:connect", { url: URL, apiKey: `ads_${"f".repeat(64)}` }),
    ).rejects.toThrow("didn't accept this machine's key");
    expect(fs.existsSync(path.join(directory, "credentials.enc"))).toBe(false);
    expect(await commands.send("sync:get-state", {})).toMatchObject({ connected: false });
  });

  it("saves the key encrypted, syncs at once and reports the result", async () => {
    const { commands, items, service, directory } = setup();
    items.set("example.com", { css: "a" });
    await commands.send("sync:connect", { url: `${URL}/`, apiKey: FAKE_APP_DATA_KEY });
    expect(service.value("domains", "example.com")).toEqual({ css: "a" });
    const saved = fs.readFileSync(path.join(directory, "credentials.enc"), "utf8");
    expect(saved).not.toContain(FAKE_APP_DATA_KEY);
    expect(protection.decrypt(new TextEncoder().encode(saved))).toContain(FAKE_APP_DATA_KEY);
    const state = await commands.send("sync:get-state", {});
    expect(state).toMatchObject({ connected: true, serviceUrl: URL, syncing: false, issues: [] });
    expect(state.lastSyncedAt).toEqual(expect.any(Number));
  });

  it("refuses to connect without a secure keyring", async () => {
    const { commands } = setup(undefined, undefined, {
      protection: {
        encrypt: () => {
          throw new Error("Sync requires a secure system keyring.");
        },
        decrypt: protection.decrypt,
      },
    });
    await expect(
      commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY }),
    ).rejects.toThrow("secure system keyring");
  });

  it("reconnects at startup and syncs local changes soon after they happen", async () => {
    const service = createFakeAppDataService();
    const first = setup(service);
    await first.commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    feature.teardown?.();

    const second = setup(service, first.directory);
    await feature.start?.(second.deps);
    await vi.waitFor(() => expect(latest(second.states)?.lastSyncedAt).toBeDefined());
    second.items.set("example.com", { css: "changed" });
    second.events.emit(DOMAIN_CSS_CHANGED, { domain: "example.com", enabled: true, hasFile: true });
    await vi.waitFor(() =>
      expect(service.value("domains", "example.com")).toEqual({ css: "changed" }),
    );
  });

  it("picks up other machines' changes on its own", async () => {
    const service = createFakeAppDataService();
    const { commands, items } = setup(service, undefined, { pollIntervalMs: 20 });
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    service.write("domains", "example.com", { css: "remote" });
    await vi.waitFor(() => expect(items.get("example.com")).toEqual({ css: "remote" }));
  });

  it("shows why a sync failed, keeps local data, and clears the error after a successful sync", async () => {
    const service = createFakeAppDataService();
    const { commands, items, states } = setup(service);
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    service.setOffline(true);
    items.set("example.com", { css: "offline" });
    await commands.send("sync:now", {});
    expect(latest(states)).toMatchObject({
      error:
        "Couldn't reach the sync service. Changes stay on this machine and sync once it can be reached.",
      lastFailedAt: expect.any(Number),
    });
    service.setOffline(false);
    await commands.send("sync:now", {});
    expect(latest(states)?.error).toBeUndefined();
    expect(service.value("domains", "example.com")).toEqual({ css: "offline" });
  });

  it("lists conflicts and settles one with the chosen version", async () => {
    const service = createFakeAppDataService();
    const { commands, items, states } = setup(service);
    items.set("example.com", { css: "a" });
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    service.write("domains", "example.com", { css: "remote" });
    items.set("example.com", { css: "local" });
    await commands.send("sync:now", {});
    expect(latest(states)?.issues).toEqual([
      {
        id: "domains/example.com",
        label: "example.com styles",
        kind: "conflict",
        message: "Changed on this machine and on another.",
        version: expect.any(String),
      },
    ]);
    const version = latest(states)?.issues[0]?.version ?? "";
    await expect(
      commands.send("sync:resolve", {
        id: "domains/example.com",
        keep: "other-machine",
        version: "0:stale",
      }),
    ).rejects.toThrow("changed again");
    await commands.send("sync:resolve", {
      id: "domains/example.com",
      keep: "other-machine",
      version,
    });
    expect(items.get("example.com")).toEqual({ css: "remote" });
    expect(latest(states)?.issues).toEqual([]);
  });

  it("forgets the key and sync state on disconnect but keeps local data", async () => {
    const { commands, items, directory, states } = setup();
    items.set("example.com", { css: "a" });
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    expect(fs.existsSync(path.join(directory, "state.json"))).toBe(true);
    await commands.send("sync:disconnect", {});
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(items.get("example.com")).toEqual({ css: "a" });
    expect(latest(states)).toMatchObject({ connected: false, issues: [] });
    await expect(commands.send("sync:now", {})).rejects.toThrow(
      "Connect to the sync service first.",
    );
  });

  it("asks to connect again when the saved key can't be read", async () => {
    const { directory, deps, states } = setup();
    fs.writeFileSync(path.join(directory, "credentials.enc"), "not json");
    await feature.start?.(deps);
    expect(latest(states)).toMatchObject({
      connected: false,
      error: "This machine's saved sync settings couldn't be read. Connect again.",
    });
  });

  it("starts afresh instead of spreading removals when local settings were unreadable", async () => {
    const service = createFakeAppDataService();
    const first = setup(service);
    first.items.set("example.com", { css: "a" });
    await first.commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    feature.teardown?.();

    // Settings were lost at startup, so local data looks empty.
    const second = setup(service, first.directory, { localDataUnreadable: () => true });
    await feature.start?.(second.deps);
    await vi.waitFor(() => expect(second.items.get("example.com")).toEqual({ css: "a" }));
    expect(service.value("domains", "example.com")).toEqual({ css: "a" });
  });

  it("lets the browser start when sync history can't be read", async () => {
    const { commands, directory } = setup();
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    fs.rmSync(path.join(directory, "state.json"));
    fs.mkdirSync(path.join(directory, "state.json"));
    feature.teardown?.();
    const again = setup(undefined, directory);
    await expect(feature.start?.(again.deps)).resolves.toBeUndefined();
    expect(latest(again.states)?.error).toMatch(/couldn't be read/);
  });

  it("lets only the first of two choices for the same conflict through", async () => {
    const service = createFakeAppDataService();
    const { commands, items, states } = setup(service);
    items.set("example.com", { css: "a" });
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    service.write("domains", "example.com", { css: "remote" });
    items.set("example.com", { css: "local" });
    await commands.send("sync:now", {});
    const version = latest(states)?.issues[0]?.version ?? "";
    const results = await Promise.allSettled([
      commands.send("sync:resolve", { id: "domains/example.com", keep: "this-machine", version }),
      commands.send("sync:resolve", { id: "domains/example.com", keep: "other-machine", version }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await commands.send("sync:now", {});
    expect(items.get("example.com")).toEqual({ css: "local" });
    expect(service.value("domains", "example.com")).toEqual({ css: "local" });
  });

  it("keeps history saved by a run from outliving a disconnect", async () => {
    const service = createFakeAppDataService();
    const { commands, items, directory } = setup(service);
    items.set("example.com", { css: "a" });
    await commands.send("sync:connect", { url: URL, apiKey: FAKE_APP_DATA_KEY });
    items.set("example.com", { css: "b" });
    const run = commands.send("sync:now", {});
    await commands.send("sync:disconnect", {});
    await run;
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});

describe("describeSyncError", () => {
  it("explains each kind of failure", () => {
    expect(describeSyncError(new AppDataError(403, "APPLICATION_MISMATCH", "x"))).toBe(
      "This key is for a different application. Create a key for the application “chiaroscuro2”.",
    );
    expect(describeSyncError(new AppDataError(503, "HTTP_ERROR", "x"))).toBe(
      "The sync service had a problem. Sync tries again automatically.",
    );
    expect(describeSyncError(new AppDataError(400, "INVALID_KEY", "Bad key."))).toBe(
      "The sync service refused the request: Bad key.",
    );
  });
});

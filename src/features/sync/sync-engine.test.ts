import { describe, expect, it } from "vitest";
import {
  createFakeAppDataService,
  FAKE_APP_DATA_KEY,
  type FakeAppDataService,
} from "../../test-utils/fake-app-data-service";
import { AppDataError, createAppDataClient, type JsonValue } from "./app-data-client.main";
import { jsonEqual } from "./merge.main";
import {
  LocalChangedError,
  type PersistedSyncState,
  SyncEngine,
  type SyncSource,
} from "./sync-engine.main";

const NS = "items";

/** One installation: its own local items and sync state, sharing the service. */
function machine(service: FakeAppDataService, apiKey = FAKE_APP_DATA_KEY) {
  const items = new Map<string, JsonValue>();
  const source: SyncSource = {
    namespace: NS,
    describe: (key) => `Item ${key}`,
    read: () => new Map([...items].map(([key, value]) => [key, structuredClone(value)])),
    parse(_key, value) {
      if (value === null || (typeof value === "object" && "invalid" in value))
        throw new Error("This version can't be used.");
      return value;
    },
    async apply(key, value, expected) {
      if (!jsonEqual(items.get(key) ?? null, expected)) throw new LocalChangedError();
      if (value === null) items.delete(key);
      else items.set(key, structuredClone(value));
    },
  };
  const state: PersistedSyncState = { service: "https://sync.example", records: {} };
  const saved: PersistedSyncState[] = [];
  const engine = new SyncEngine(
    createAppDataClient({ url: "https://sync.example", apiKey, fetch: service.fetch }),
    [source],
    state,
    async (current) => {
      saved.push(structuredClone(current));
    },
  );
  return { items, engine, state, saved };
}

/** The conflict version the user is shown, which a choice must name. */
function version(m: { engine: SyncEngine }): string {
  return m.engine.getIssues()[0]?.version ?? "";
}

function puts(service: FakeAppDataService) {
  return service.requests.filter((r) => r.method === "PUT").length;
}

describe("SyncEngine", () => {
  it("uploads local items and downloads them on another machine", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    expect(service.value(NS, "one")).toEqual({ css: "a" });
    await b.engine.run();
    expect(b.items.get("one")).toEqual({ css: "a" });
    expect(a.saved.at(-1)?.records[`${NS}/one`]).toEqual({ revision: 1, base: { css: "a" } });
  });

  it("sends later edits both ways", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    b.items.set("one", { css: "b" });
    await b.engine.run();
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "b" });
    expect(a.engine.getIssues()).toEqual([]);
  });

  it("removes an item everywhere, and a machine that was offline doesn't bring it back", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.delete("one");
    await a.engine.run();
    expect(service.value(NS, "one")).toBeNull();
    await b.engine.run();
    expect(b.items.has("one")).toBe(false);
    await b.engine.run();
    expect(service.value(NS, "one")).toBeNull();
  });

  it("reports an edit made while another machine removed the item, and keeps the chosen version", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.delete("one");
    await a.engine.run();
    b.items.set("one", { css: "edited offline" });
    await b.engine.run();
    expect(b.engine.getIssues()).toEqual([
      {
        id: `${NS}/one`,
        label: "Item one",
        kind: "conflict",
        message: "Changed on this machine and removed on another.",
        version: expect.any(String),
      },
    ]);
    expect(b.items.get("one")).toEqual({ css: "edited offline" });
    await b.engine.resolve(`${NS}/one`, "this-machine", version(b));
    expect(b.engine.getIssues()).toEqual([]);
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "edited offline" });
  });

  it("merges edits to different properties made on two machines", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a", enabled: false });
    await a.engine.run();
    await b.engine.run();
    a.items.set("one", { css: "a2", enabled: false });
    b.items.set("one", { css: "a", enabled: true });
    await a.engine.run();
    await b.engine.run();
    expect(b.items.get("one")).toEqual({ css: "a2", enabled: true });
    expect(service.value(NS, "one")).toEqual({ css: "a2", enabled: true });
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "a2", enabled: true });
    expect([...a.engine.getIssues(), ...b.engine.getIssues()]).toEqual([]);
  });

  it("leaves edits to the same property as a conflict until the user chooses", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.set("one", { css: "from a" });
    b.items.set("one", { css: "from b" });
    await a.engine.run();
    await b.engine.run();
    expect(b.engine.getIssues().map((issue) => issue.kind)).toEqual(["conflict"]);
    // Neither version is lost while the conflict waits.
    expect(b.items.get("one")).toEqual({ css: "from b" });
    expect(service.value(NS, "one")).toEqual({ css: "from a" });
    await b.engine.run();
    expect(b.engine.getIssues()).toHaveLength(1);

    await b.engine.resolve(`${NS}/one`, "other-machine", version(b));
    expect(b.items.get("one")).toEqual({ css: "from a" });
    expect(b.engine.getIssues()).toEqual([]);
    await b.engine.run();
    expect(b.engine.getIssues()).toEqual([]);
  });

  it("keeps this machine's version everywhere when the user chooses it", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.set("one", { css: "from a" });
    b.items.set("one", { css: "from b" });
    await a.engine.run();
    await b.engine.run();
    await b.engine.resolve(`${NS}/one`, "this-machine", version(b));
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "from b" });
  });

  it("refuses to settle a conflict that changed again", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.set("one", { css: "from a" });
    b.items.set("one", { css: "from b" });
    await a.engine.run();
    await b.engine.run();
    b.items.set("one", { css: "from b again" });
    const resolve = b.engine.resolve(`${NS}/one`, "other-machine", version(b));
    await expect(resolve).rejects.toThrow("changed again");
    expect(b.items.get("one")).toEqual({ css: "from b again" });
  });

  it("reconciles with a version another machine wrote during the upload", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a", enabled: false });
    await a.engine.run();
    a.items.set("one", { css: "a", enabled: true });
    const original = service.fetch;
    let raced = false;
    const racing = machine({
      ...service,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT" && !raced) {
          raced = true;
          service.write(NS, "one", { css: "from c", enabled: false });
        }
        return original(input, init);
      }) as typeof fetch,
    });
    // Machine "racing" shares the service but loses the first upload to another write.
    racing.items.set("one", { css: "a", enabled: false });
    racing.state.records[`${NS}/one`] = { revision: 1, base: { css: "a", enabled: false } };
    racing.items.set("one", { css: "a", enabled: true });
    await racing.engine.run();
    expect(raced).toBe(true);
    expect(racing.items.get("one")).toEqual({ css: "from c", enabled: true });
    expect(service.value(NS, "one")).toEqual({ css: "from c", enabled: true });
  });

  it("keeps an item the service finds too large, says why, and doesn't upload it again", async () => {
    const service = createFakeAppDataService({ maxValueBytes: 40 });
    const a = machine(service);
    a.items.set("big", { css: "x".repeat(100) });
    a.items.set("small", { css: "y" });
    await a.engine.run();
    expect(service.value(NS, "small")).toEqual({ css: "y" });
    expect(a.items.get("big")).toEqual({ css: "x".repeat(100) });
    expect(a.engine.getIssues()).toEqual([
      {
        id: `${NS}/big`,
        label: "Item big",
        kind: "too-large",
        message:
          "Too large to sync. The service says: “JSON values are limited to 40 bytes.” It stays on this machine.",
      },
    ]);
    const before = puts(service);
    await a.engine.run();
    expect(puts(service)).toBe(before);
    expect(a.engine.getIssues()).toHaveLength(1);

    a.items.set("big", { css: "smaller" });
    await a.engine.run();
    expect(service.value(NS, "big")).toEqual({ css: "smaller" });
    expect(a.engine.getIssues()).toEqual([]);
  });

  it("downloads but doesn't upload with a read-only key", async () => {
    const service = createFakeAppDataService({
      keys: { [FAKE_APP_DATA_KEY]: {}, [`ads_${"b".repeat(64)}`]: { readOnly: true } },
    });
    const writer = machine(service);
    const reader = machine(service, `ads_${"b".repeat(64)}`);
    writer.items.set("one", { css: "a" });
    await writer.engine.run();
    reader.items.set("two", { css: "local" });
    await reader.engine.run();
    expect(reader.items.get("one")).toEqual({ css: "a" });
    expect(reader.engine.readOnly).toBe(true);
    expect(service.value(NS, "two")).toBeUndefined();
    expect(reader.engine.getIssues()).toEqual([]);
  });

  it("reports a version it can't use and leaves the local item alone", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    service.write(NS, "one", { invalid: true });
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "a" });
    expect(a.engine.getIssues()).toEqual([
      {
        id: `${NS}/one`,
        label: "Item one",
        kind: "not-applied",
        message: "This version can't be used.",
      },
    ]);
  });

  it("uploads an item created here even if another machine removed one with that key earlier", async () => {
    const service = createFakeAppDataService();
    service.write(NS, "one", { css: "old" });
    service.write(NS, "one", null);
    const a = machine(service);
    a.items.set("one", { css: "new" });
    await a.engine.run();
    expect(service.value(NS, "one")).toEqual({ css: "new" });
  });

  it("stops with the service's error while offline and keeps local items", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a" });
    service.setOffline(true);
    await expect(a.engine.run()).rejects.toMatchObject({ code: "NETWORK" });
    expect(a.items.get("one")).toEqual({ css: "a" });
    service.setOffline(false);
    await a.engine.run();
    expect(service.value(NS, "one")).toEqual({ css: "a" });
  });

  it("stops the whole run when the key is rejected", async () => {
    const service = createFakeAppDataService();
    const a = machine(service, `ads_${"c".repeat(64)}`);
    a.items.set("one", { css: "a" });
    const error = await a.engine.run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppDataError);
    expect((error as AppDataError).status).toBe(401);
  });

  it("reads every page of a namespace", async () => {
    const service = createFakeAppDataService({ pageSize: 2 });
    for (const key of ["a", "b", "c", "d", "e"]) service.write(NS, key, { key });
    const a = machine(service);
    await a.engine.run();
    expect([...a.items.keys()].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("saves nothing after it was stopped", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a" });
    a.engine.stop();
    await a.engine.run();
    expect(a.saved).toEqual([]);
    expect(service.value(NS, "one")).toBeUndefined();
  });

  it("treats a live JSON null as an invalid version, not a removal", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    service.write(NS, "one", null, { live: true });
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "a" });
    expect(a.engine.getIssues()).toMatchObject([{ kind: "not-applied" }]);
  });

  it("stops making requests and changes once stopped mid-request", async () => {
    const service = createFakeAppDataService();
    let stop: () => void = () => {};
    const seen: string[] = [];
    const a = machine({
      ...service,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init?.method ?? "GET");
        if (init?.method === "PUT") {
          stop();
          service.write(NS, "one", { css: "other" });
        }
        return service.fetch(input, init);
      }) as typeof fetch,
    });
    stop = () => a.engine.stop();
    a.items.set("one", { css: "a" });
    await a.engine.run();
    expect(seen).toEqual(["GET", "PUT"]);
    expect(a.items.get("one")).toEqual({ css: "a" });
    expect(a.saved).toEqual([]);
  });

  it("removes nothing when the service lost its documents, and uploads them again", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    a.items.set("one", { css: "a" });
    a.items.set("two", { css: "b" });
    await a.engine.run();
    service.reset();
    service.write(NS, "two", { css: "restored older" });
    await a.engine.run();
    expect(a.items.get("one")).toEqual({ css: "a" });
    expect(service.value(NS, "one")).toEqual({ css: "a" });
    // An older version at a lower revision is a conflict, not an update to apply.
    expect(a.items.get("two")).toEqual({ css: "b" });
    expect(a.engine.getIssues().map((issue) => issue.id)).toEqual([`${NS}/two`]);
  });

  it("moves on to other items when one keeps changing during upload", async () => {
    const service = createFakeAppDataService();
    const a = machine({
      ...service,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT" && String(input).includes("key=busy"))
          service.write(NS, "busy", { n: Math.random() });
        return service.fetch(input, init);
      }) as typeof fetch,
    });
    a.items.set("busy", { n: 0 });
    a.items.set("calm", { css: "a" });
    await a.engine.run();
    expect(service.value(NS, "calm")).toEqual({ css: "a" });
  });

  it("refuses a conflict choice for versions the user wasn't shown", async () => {
    const service = createFakeAppDataService();
    const a = machine(service);
    const b = machine(service);
    a.items.set("one", { css: "a" });
    await a.engine.run();
    await b.engine.run();
    a.items.set("one", { css: "from a" });
    b.items.set("one", { css: "from b" });
    await a.engine.run();
    await b.engine.run();
    await expect(b.engine.resolve(`${NS}/one`, "other-machine", "1:old")).rejects.toThrow(
      "changed again",
    );
    expect(b.items.get("one")).toEqual({ css: "from b" });
  });
});

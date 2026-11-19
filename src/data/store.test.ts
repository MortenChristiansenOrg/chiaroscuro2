import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonDataStore } from "./store";

interface TestDoc {
  id: string;
  name: string;
  value: number;
}

let dataDir: string;
let store: JsonDataStore;

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chiaroscuro-test-"));
  store = new JsonDataStore(dataDir);
  await store.initialize();
});

afterEach(async () => {
  await store.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("JsonDataStore", () => {
  it("creates data directory on initialize", () => {
    expect(fs.existsSync(dataDir)).toBe(true);
  });

  it("persists and loads collections across instances", async () => {
    const col = store.collection<TestDoc>("items");
    await col.insert({ id: "1", name: "A", value: 10 });
    await col.insert({ id: "2", name: "B", value: 20 });

    // Flush and create new instance
    await store.destroy();

    const store2 = new JsonDataStore(dataDir);
    await store2.initialize();
    const col2 = store2.collection<TestDoc>("items");

    const docs = await col2.findMany({});
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.id === "1")?.name).toBe("A");
    expect(docs.find((d) => d.id === "2")?.value).toBe(20);

    await store2.destroy();
  });

  it("persists updates", async () => {
    const col = store.collection<TestDoc>("items");
    await col.insert({ id: "1", name: "A", value: 10 });
    await col.update("1", { value: 99 });

    await store.destroy();

    const store2 = new JsonDataStore(dataDir);
    await store2.initialize();
    const doc = await store2.collection<TestDoc>("items").findOne("1");
    expect(doc?.value).toBe(99);

    await store2.destroy();
  });

  it("persists removals", async () => {
    const col = store.collection<TestDoc>("items");
    await col.insert({ id: "1", name: "A", value: 10 });
    await col.insert({ id: "2", name: "B", value: 20 });
    await col.remove("1");

    await store.destroy();

    const store2 = new JsonDataStore(dataDir);
    await store2.initialize();
    const docs = await store2.collection<TestDoc>("items").findMany({});
    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe("2");

    await store2.destroy();
  });

  it("persists settings across instances", async () => {
    await store.setSetting("theme", "dark");
    await store.setSetting("fontSize", 14);

    await store.destroy();

    const store2 = new JsonDataStore(dataDir);
    await store2.initialize();
    expect(await store2.getSetting("theme")).toBe("dark");
    expect(await store2.getSetting("fontSize")).toBe(14);

    await store2.destroy();
  });

  it("handles corrupted collection file gracefully", async () => {
    // Write garbage to a collection file
    fs.writeFileSync(path.join(dataDir, "bad.json"), "not json{{{");

    const col = store.collection<TestDoc>("bad");
    const docs = await col.findMany({});
    expect(docs).toHaveLength(0);
  });

  it("handles corrupted settings file gracefully", async () => {
    fs.writeFileSync(path.join(dataDir, "settings.json"), "broken");
    await store.destroy();

    const store2 = new JsonDataStore(dataDir);
    await store2.initialize();
    expect(await store2.getSetting("anything")).toBeUndefined();

    await store2.destroy();
  });

  it("multiple collections are independent", async () => {
    const a = store.collection<TestDoc>("alpha");
    const b = store.collection<TestDoc>("beta");

    await a.insert({ id: "1", name: "A", value: 1 });
    await b.insert({ id: "1", name: "B", value: 2 });

    expect((await a.findOne("1"))?.name).toBe("A");
    expect((await b.findOne("1"))?.name).toBe("B");
  });

  it("observe works on persistent collections", async () => {
    const col = store.collection<TestDoc>("items");
    const callback = vi.fn();
    col.observe({ selector: { value: 10 } }).subscribe(callback);

    await col.insert({ id: "1", name: "A", value: 10 });
    await col.insert({ id: "2", name: "B", value: 20 });

    // Initial empty + after A (matches) + after B (doesn't match but emits)
    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith([{ id: "1", name: "A", value: 10 }]);
  });

  it("keeps an unreadable settings file and reports it until acknowledged, across restarts", async () => {
    for (const unreadable of ["{ not json", "[]"]) {
      fs.writeFileSync(path.join(dataDir, "settings.json"), unreadable);
      const reopened = new JsonDataStore(dataDir);
      await reopened.initialize();
      expect(reopened.settingsUnreadable()).toBe(true);
      expect(await reopened.getSetting("anything")).toBeUndefined();
      expect(fs.existsSync(path.join(dataDir, "settings.json"))).toBe(false);
      // A later start, with no settings file at all, still knows.
      const restarted = new JsonDataStore(dataDir);
      await restarted.initialize();
      expect(restarted.settingsUnreadable()).toBe(true);
      restarted.acknowledgeSettingsUnreadable();
      expect(restarted.settingsUnreadable()).toBe(false);
    }
    expect(
      fs.readdirSync(dataDir).filter((f) => f.startsWith("settings.json.unreadable-")),
    ).toHaveLength(2);
  });

  it("reports settings missing at startup as possibly lost", async () => {
    const fresh = new JsonDataStore(dataDir);
    await fresh.initialize();
    expect(fresh.settingsUnreadable()).toBe(true);
    fresh.acknowledgeSettingsUnreadable();
    expect(fresh.settingsUnreadable()).toBe(false);
    await fresh.setSetting("kept", 1);
    const restarted = new JsonDataStore(dataDir);
    await restarted.initialize();
    expect(restarted.settingsUnreadable()).toBe(false);
  });

  it("still starts and reports the loss when the marker can't be written", async () => {
    fs.writeFileSync(path.join(dataDir, "settings.json"), "{ not json");
    const write = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("ENOSPC");
    });
    const reopened = new JsonDataStore(dataDir);
    await reopened.initialize();
    write.mockRestore();
    expect(reopened.settingsUnreadable()).toBe(true);
  });

  it("retries keeping the unreadable file before the next save", async () => {
    fs.writeFileSync(path.join(dataDir, "settings.json"), "{ not json");
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
    });
    const reopened = new JsonDataStore(dataDir);
    await reopened.initialize();
    await expect(reopened.setSetting("a", 1, { durable: true })).rejects.toThrow("aren't saved");
    expect(fs.readFileSync(path.join(dataDir, "settings.json"), "utf-8")).toBe("{ not json");
    rename.mockRestore();
    await reopened.setSetting("a", 1, { durable: true });
    expect(
      fs.readdirSync(dataDir).filter((f) => f.startsWith("settings.json.unreadable-")),
    ).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf-8"))).toEqual({
      a: 1,
    });
  });

  it("retries a rename refused while the file is held, and ordinary saves fall back", async () => {
    const busy = () => {
      throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    };
    const once = vi.spyOn(fs, "renameSync").mockImplementationOnce(busy);
    await store.setSetting("a", 1, { durable: true });
    once.mockRestore();
    expect(await store.getSetting("a")).toBe(1);

    const always = vi.spyOn(fs, "renameSync").mockImplementation(busy);
    await expect(store.setSetting("a", 2, { durable: true })).rejects.toThrow("EBUSY");
    expect(await store.getSetting("a")).toBe(1);
    await store.setSetting("b", 3);
    always.mockRestore();
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf-8"))).toEqual({
      a: 1,
      b: 3,
    });
    expect(fs.readdirSync(dataDir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });

  it("throws on a failed durable write and leaves the setting unchanged", async () => {
    await store.setSetting("kept", 1);
    const write = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("ENOSPC");
    });
    await expect(store.setSetting("kept", 2, { durable: true })).rejects.toThrow("ENOSPC");
    write.mockRestore();
    expect(await store.getSetting("kept")).toBe(1);
  });
});

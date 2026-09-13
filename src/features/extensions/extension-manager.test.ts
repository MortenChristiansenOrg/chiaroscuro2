import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDataStore } from "../../data/memory-store";
import { createMockPlatform } from "../../test-utils/mock-platform";
import { ExtensionManager, type ExtensionRecord } from "./extension-manager";
import { BITWARDEN_ID } from "./extension-package";
import { archive } from "./extension-test-utils";

const id = BITWARDEN_ID;
const dirs: string[] = [],
  managers: ExtensionManager[] = [];
afterEach(async () => {
  managers.splice(0).forEach((manager) => {
    manager.stop();
  });
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
const manifest = (version: string, permissions = ["storage"]) => ({
  manifest_version: 3,
  name: "Bitwarden",
  version,
  permissions,
});
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "extension-manager-"));
  dirs.push(root);
  const store = new MemoryDataStore();
  const load = vi.fn(async (directory: string) => {
    const data = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
    return {
      id: "runtime-id",
      name: data.name,
      version: data.version,
      path: directory,
      manifest: data,
    };
  });
  const remove = vi.fn();
  const platform = createMockPlatform({
    getUserDataPath: () => root,
    loadExtension: load,
    removeExtension: remove,
  });
  const fetch = vi.fn(async () => archive({ "manifest.json": JSON.stringify(manifest("1.0")) }));
  const make = () => {
    const manager = new ExtensionManager(
      platform,
      store,
      vi.fn(),
      "140.0",
      fetch,
      (bytes) => bytes,
    );
    managers.push(manager);
    return manager;
  };
  const manager = make();
  await manager.start();
  return { root, store, manager, make, fetch, load, remove };
}
async function install(manager: ExtensionManager) {
  await manager.check(id);
  const pending = manager.records[0]?.pending;
  if (!pending) throw new Error("No review");
  await manager.approve(id, pending.hash);
}
describe("extension lifecycle", () => {
  it("does not execute downloaded code until its exact permissions are approved", async () => {
    const { manager, load } = await setup();
    await manager.check(id);
    expect(load).not.toHaveBeenCalled();
    await expect(manager.approve(id, "wrong")).rejects.toThrow("changed");
    const pending = manager.records[0]?.pending;
    if (!pending) throw new Error("No review");
    await manager.approve(id, pending.hash);
    expect(load).toHaveBeenCalledTimes(1);
    expect(manager.records[0]).toMatchObject({
      version: "1.0",
      installed: true,
      enabled: true,
      permissions: ["storage"],
    });
  });
  it("stages updates without interrupting the vault and activates at the same path on restart", async () => {
    const { manager, fetch, load, make, root } = await setup();
    await install(manager);
    await fs.writeFile(path.join(root, "vault-sentinel"), "durable vault");
    fetch.mockImplementation(async () =>
      archive({ "manifest.json": JSON.stringify(manifest("2.0")) }),
    );
    await manager.check(id);
    expect(load).toHaveBeenCalledTimes(1);
    expect(manager.records[0]?.version).toBe("1.0");
    expect(manager.records[0]?.pending?.approved).toBe(true);
    manager.stop();
    const restarted = make();
    await restarted.start();
    expect(restarted.records[0]?.version).toBe("2.0");
    expect(load.mock.calls[0]?.[0]).toBe(load.mock.calls[1]?.[0]);
    expect(await fs.readFile(path.join(root, "vault-sentinel"), "utf8")).toBe("durable vault");
    await restarted.setEnabled(id, false); // drains startup check
  });
  it("requires new permissions and rejects an approval for an obsolete package", async () => {
    const { manager, fetch } = await setup();
    await install(manager);
    fetch.mockImplementation(async () =>
      archive({ "manifest.json": JSON.stringify(manifest("2.0", ["storage", "tabs"])) }),
    );
    await manager.check(id);
    const token = manager.records[0]?.pending?.hash;
    expect(manager.records[0]?.pending?.approved).toBe(false);
    fetch.mockImplementation(async () =>
      archive({
        "manifest.json": JSON.stringify(manifest("3.0", ["storage", "tabs", "notifications"])),
      }),
    );
    await manager.check(id);
    await expect(manager.approve(id, token ?? "")).rejects.toThrow("changed");
    expect(manager.records[0]?.permissions).toEqual(["storage"]);
  });
  it("updates a disabled extension without enabling or loading it", async () => {
    const { manager, fetch, make, load } = await setup();
    await install(manager);
    await manager.setEnabled(id, false);
    load.mockClear();
    fetch.mockImplementation(async () =>
      archive({ "manifest.json": JSON.stringify(manifest("2.0")) }),
    );
    await manager.check(id);
    manager.stop();
    const restarted = make();
    await restarted.start();
    await restarted.setEnabled(id, false);
    expect(restarted.records[0]).toMatchObject({ version: "2.0", enabled: false });
    expect(load).not.toHaveBeenCalled();
  });
  it("restores the previous package after activation failure", async () => {
    const { manager, fetch, make, load, store } = await setup();
    await install(manager);
    fetch.mockImplementation(async () =>
      archive({ "manifest.json": JSON.stringify(manifest("2.0")) }),
    );
    await manager.check(id);
    manager.stop();
    load.mockRejectedValueOnce(new Error("Native load rejected"));
    const restarted = make();
    await restarted.start();
    await restarted.setEnabled(id, false);
    expect(
      JSON.parse(await fs.readFile(path.join(restarted.directory(id), "manifest.json"), "utf8"))
        .version,
    ).toBe("1.0");
    expect((await store.getSetting<ExtensionRecord[]>("extensions"))?.[0]?.version).toBe("1.0");
  });
  it("leaves working code intact on network or persistence failures", async () => {
    const { manager, fetch, store, remove } = await setup();
    await install(manager);
    fetch.mockRejectedValueOnce(new Error("Offline"));
    await expect(manager.check(id)).rejects.toThrow("Offline");
    expect(manager.loaded.has(id)).toBe(true);
    vi.spyOn(store, "setSetting").mockRejectedValueOnce(new Error("Disk full"));
    await expect(manager.setEnabled(id, false)).rejects.toThrow("Disk full");
    expect(manager.records[0]?.enabled).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });
  it("uninstalls package code and pending updates while retaining vault storage", async () => {
    const { manager, root } = await setup();
    await install(manager);
    await fs.writeFile(path.join(root, "vault-sentinel"), "vault");
    await manager.uninstall(id);
    expect(manager.records).toEqual([]);
    await expect(fs.access(manager.directory(id))).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "vault-sentinel"), "utf8")).toBe("vault");
  });
  it("recovers a crash between directory swaps before loading extension code", async () => {
    const { manager, store, make, root } = await setup();
    await install(manager);
    manager.stop();
    const previous = structuredClone(manager.records[0]);
    if (!previous) throw new Error("Missing install");
    await fs.rename(manager.directory(id), path.join(manager.root, `.${id}.previous`));
    await fs.writeFile(
      path.join(manager.root, `.${id}.transaction.json`),
      JSON.stringify({ previous, next: { ...previous, version: "2.0" }, hadCurrent: true }),
    );
    const restarted = make();
    await restarted.start();
    await restarted.setEnabled(id, false);
    expect(
      JSON.parse(await fs.readFile(path.join(restarted.directory(id), "manifest.json"), "utf8"))
        .version,
    ).toBe("1.0");
    expect((await store.getSetting<ExtensionRecord[]>("extensions"))?.[0]?.version).toBe("1.0");
    await expect(
      fs.access(path.join(root, "extensions", `.${id}.transaction.json`)),
    ).rejects.toThrow();
  });
  it("refuses a modified staged package before replacing working code", async () => {
    const { manager, fetch, make } = await setup();
    await install(manager);
    fetch.mockImplementation(async () =>
      archive({ "manifest.json": JSON.stringify(manifest("2.0")) }),
    );
    await manager.check(id);
    manager.stop();
    await fs.appendFile(path.join(manager.root, `.${id}.pending.crx`), "tampered");
    const restarted = make();
    await restarted.start();
    await restarted.setEnabled(id, false);
    expect(
      JSON.parse(await fs.readFile(path.join(restarted.directory(id), "manifest.json"), "utf8"))
        .version,
    ).toBe("1.0");
  });
});

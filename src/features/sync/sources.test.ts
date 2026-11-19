import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import {
  createFakeAppDataService,
  FAKE_APP_DATA_KEY,
} from "../../test-utils/fake-app-data-service";
import domainCss, { type DomainCssDeps } from "../domain-css/domain-css.main";
import { DOMAIN_CSS_TOGGLE, DOMAIN_NAVIGATION_SET } from "../domain-css/domain-css.shared";
import domainScripts, {
  type DomainScriptsDeps,
  type PageSnapshot,
} from "../domain-scripts/domain-scripts.main";
import {
  DOMAIN_SCRIPTS_LIST,
  DOMAIN_SCRIPTS_SAVE,
  type DomainScript,
} from "../domain-scripts/domain-scripts.shared";
import type { Tab } from "../tabs/tabs.shared";
import { createAppDataClient } from "./app-data-client.main";
import { domainCustomizationSource, domainScriptSource } from "./sources.main";
import { SyncEngine } from "./sync-engine.main";

let dataDir: string | undefined;
afterEach(() => {
  domainCss.teardown?.();
  domainScripts.teardown?.();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

const navigation = {
  blockNavigate: { enabled: false, crossOriginOnly: false },
  blockRedirect: { enabled: false, crossOriginOnly: false },
  blockFrameNavigate: { enabled: false, crossOriginOnly: false },
  blockNewTabs: false,
  blockNewWindows: false,
};

function script(overrides: Partial<DomainScript> = {}): DomainScript {
  return {
    id: "script-one",
    domain: "example.com",
    name: "Copy title",
    source: "await copy(document.title);",
    enabled: true,
    runAt: "manual",
    pathPattern: "/*",
    alias: "/copy-title",
    shortcut: "",
    ...overrides,
  };
}

/** The real domain CSS and script features on one machine, syncing with a fake service. */
/** Fails durable writes on request, like a full disk. */
class FlakyStore extends MemoryDataStore {
  failDurable = false;
  /** Runs while a durable save is in progress, as an edit made meanwhile would. */
  duringDurable: (() => void) | undefined;
  override async setSettings(values: Record<string, unknown>, options?: { durable?: boolean }) {
    if (options?.durable && this.failDurable) throw new Error("ENOSPC: no space left on device");
    if (options?.durable) this.duringDurable?.();
    return super.setSettings(values, options);
  }
}

async function setup() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-sources-"));
  const commands = new CommandBus();
  const events = new EventBus();
  const dataStore = new FlakyStore();
  const shortcuts = new Set<string>();
  const platform = createMockPlatform({
    registerWebsiteShortcut: vi.fn((accelerator: string) => {
      shortcuts.add(accelerator);
      return () => shortcuts.delete(accelerator);
    }),
  });
  const tabs = new Map<TabId, Tab>([
    ["tab-1" as TabId, { id: "tab-1", url: "https://example.com/page" } as Tab],
  ]);
  commands.handle("tabs:create", async () => "tab-new" as TabId);
  commands.handle("tabs:activate", async () => {});
  const cssDeps = {
    commands,
    events,
    platform,
    dataStore,
    dataDir,
    getTabsSnapshot: () => tabs,
  } as unknown as DomainCssDeps;
  const scriptDeps = {
    commands,
    events,
    platform,
    dataStore,
    getActivePageTabId: () => undefined,
    getPageSnapshots: () => new Map<TabId, PageSnapshot>(),
  } as unknown as DomainScriptsDeps;
  domainCss.register(cssDeps);
  domainScripts.register(scriptDeps);
  await domainScripts.start?.(scriptDeps);
  await domainCss.start?.(cssDeps);
  const service = createFakeAppDataService();
  const engine = new SyncEngine(
    createAppDataClient({
      url: "https://sync.example",
      apiKey: FAKE_APP_DATA_KEY,
      fetch: service.fetch,
    }),
    [domainCustomizationSource, domainScriptSource],
    { service: "https://sync.example", records: {} },
    async () => {},
  );
  const send = commands.send.bind(commands) as (name: string, payload: unknown) => Promise<unknown>;
  const cssFile = path.join(dataDir, "domain-css", "example.com.css");
  return { engine, service, send, platform, shortcuts, events, dataStore, cssFile };
}

describe("domain customization sync", () => {
  it("uploads styles, enabled state and navigation rules in the service adapter's shape", async () => {
    const { engine, service, send, cssFile } = await setup();
    fs.writeFileSync(cssFile, "h1 { color: red; }");
    await send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
    await send(DOMAIN_NAVIGATION_SET, { domain: "other.org", ...navigation, blockNewTabs: true });
    await engine.run();
    expect(service.value("domains", "example.com")).toEqual({
      schemaVersion: 1,
      domain: "example.com",
      css: "h1 { color: red; }",
      enabled: true,
      navigation,
    });
    expect(service.value("domains", "other.org")).toEqual({
      schemaVersion: 1,
      domain: "other.org",
      css: null,
      enabled: false,
      navigation: { ...navigation, blockNewTabs: true },
    });
  });

  it("applies another machine's styles to open pages and its removal", async () => {
    const { engine, service, send, platform, cssFile } = await setup();
    service.write("domains", "example.com", {
      schemaVersion: 1,
      domain: "example.com",
      css: "h1 { color: blue; }",
      enabled: true,
      navigation: { ...navigation, blockNewWindows: true },
    });
    await engine.run();
    expect(fs.readFileSync(cssFile, "utf8")).toBe("h1 { color: blue; }");
    expect(platform.insertCSS).toHaveBeenCalledWith("tab-1", "h1 { color: blue; }");
    expect(await send("domain-navigation:get-state", { domain: "example.com" })).toMatchObject({
      blockNewWindows: true,
    });

    service.write("domains", "example.com", null);
    await engine.run();
    expect(fs.existsSync(cssFile)).toBe(false);
    expect(platform.removeInsertedCSS).toHaveBeenCalled();
    expect(await send("domain-css:get-state", { domain: "example.com" })).toEqual({
      domain: "example.com",
      enabled: false,
      hasFile: false,
    });
  });

  it("reports a version for a key that isn't a domain", async () => {
    const { engine, service } = await setup();
    service.write("domains", "not a domain", {
      schemaVersion: 1,
      domain: "not a domain",
      css: null,
      enabled: true,
      navigation,
    });
    await engine.run();
    expect(engine.getIssues()).toMatchObject([
      { kind: "not-applied", message: "not a domain isn't a domain this browser can customize." },
    ]);
  });

  it("reports a version saved by a newer browser instead of misreading it", async () => {
    const { engine, service } = await setup();
    service.write("domains", "example.com", { schemaVersion: 2, domain: "example.com" });
    await engine.run();
    expect(engine.getIssues()[0]?.message).toMatch(/newer version of Chiaroscuro/);
  });
});

describe("domain customization sync safety", () => {
  it("changes nothing locally when the change can't be saved, and tries again later", async () => {
    const { engine, service, send, dataStore, cssFile } = await setup();
    fs.writeFileSync(cssFile, "h1 { color: red; }");
    await send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
    await engine.run();
    service.write("domains", "example.com", {
      schemaVersion: 1,
      domain: "example.com",
      css: "h1 { color: blue; }",
      enabled: false,
      navigation,
    });
    dataStore.failDurable = true;
    await engine.run();
    expect(fs.readFileSync(cssFile, "utf8")).toBe("h1 { color: red; }");
    expect(await send("domain-css:get-state", { domain: "example.com" })).toMatchObject({
      enabled: true,
    });
    expect(engine.getIssues()).toMatchObject([
      {
        kind: "not-applied",
        message: "The change for example.com couldn't be saved on this machine.",
      },
    ]);
    dataStore.failDurable = false;
    await engine.run();
    expect(fs.readFileSync(cssFile, "utf8")).toBe("h1 { color: blue; }");
    expect(engine.getIssues()).toEqual([]);
  });

  it("keeps a stylesheet edited while another machine's version was being applied", async () => {
    const { engine, service, send, dataStore, cssFile } = await setup();
    fs.writeFileSync(cssFile, "h1 { color: red; }");
    await send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
    await engine.run();
    service.write("domains", "example.com", {
      schemaVersion: 1,
      domain: "example.com",
      css: "h1 { color: blue; }",
      enabled: false,
      navigation,
    });
    dataStore.duringDurable = () => {
      dataStore.duringDurable = undefined;
      fs.writeFileSync(cssFile, "h1 { color: green; }");
    };
    await engine.run().catch(() => {});
    expect(fs.readFileSync(cssFile, "utf8")).toBe("h1 { color: green; }");
    expect(await send("domain-css:get-state", { domain: "example.com" })).toMatchObject({
      enabled: true,
    });
    expect(fs.readdirSync(path.dirname(cssFile)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    // Both machines changed the stylesheet, so the next run asks which to keep.
    await engine.run();
    expect(fs.readFileSync(cssFile, "utf8")).toBe("h1 { color: green; }");
    expect(engine.getIssues()).toMatchObject([{ kind: "conflict" }]);
  });

  it("stops instead of treating an unreadable stylesheet as removed", async () => {
    const { engine, service, send, cssFile } = await setup();
    fs.writeFileSync(cssFile, "h1 { color: red; }");
    await send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
    await engine.run();
    fs.rmSync(cssFile);
    fs.mkdirSync(cssFile);
    await expect(engine.run()).rejects.toThrow("The stylesheet for example.com couldn't be read.");
    expect(service.value("domains", "example.com")).toMatchObject({ css: "h1 { color: red; }" });
  });

  it("drops the AI undo snapshot once another machine's stylesheet replaces it", async () => {
    const { engine, service, cssFile } = await setup();
    fs.writeFileSync(`${cssFile}.previous.json`, JSON.stringify({ source: null, enabled: false }));
    service.write("domains", "example.com", {
      schemaVersion: 1,
      domain: "example.com",
      css: "h1 { color: blue; }",
      enabled: true,
      navigation,
    });
    await engine.run();
    expect(fs.existsSync(`${cssFile}.previous.json`)).toBe(false);
  });
});

describe("website script sync", () => {
  it("uploads scripts and applies another machine's scripts with their shortcuts", async () => {
    const { engine, service, send, shortcuts } = await setup();
    await send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    await engine.run();
    expect(service.value("scripts", "script-one")).toEqual({ schemaVersion: 1, ...script() });

    service.write("scripts", "script-two", {
      schemaVersion: 1,
      ...script({ id: "script-two", name: "Second", alias: "/second", shortcut: "Ctrl+Shift+2" }),
    });
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([
      script(),
      script({ id: "script-two", name: "Second", alias: "/second", shortcut: "Ctrl+Shift+2" }),
    ]);
    expect(shortcuts.has("Ctrl+Shift+2")).toBe(true);

    service.write("scripts", "script-two", null);
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([script()]);
    expect(shortcuts.has("Ctrl+Shift+2")).toBe(false);
  });

  it("keeps a script whose alias is already used here out and says why", async () => {
    const { engine, service, send } = await setup();
    await send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    service.write("scripts", "script-two", {
      schemaVersion: 1,
      ...script({ id: "script-two", name: "Clash" }),
    });
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([script()]);
    expect(engine.getIssues()).toEqual([
      {
        id: "scripts/script-two",
        label: "Script “Clash” on example.com",
        kind: "not-applied",
        message: "Alias /copy-title is already used on this domain.",
      },
    ]);
  });

  it("refuses a version whose fields are missing", async () => {
    const { engine, service } = await setup();
    const { alias: _, ...incomplete } = script({ id: "script-two" });
    service.write("scripts", "script-two", { schemaVersion: 1, ...incomplete });
    await engine.run();
    expect(engine.getIssues()[0]?.message).toMatch(
      /^The version from another machine isn't valid: alias/,
    );
  });

  it("never moves a script to another domain", async () => {
    const { engine, service, send } = await setup();
    await send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    await engine.run();
    service.write("scripts", "script-one", {
      schemaVersion: 1,
      ...script({ domain: "other.org" }),
    });
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([script()]);
    expect(engine.getIssues()[0]?.message).toBe(
      "The other machine's version runs on other.org instead of example.com. A script's domain can't change.",
    );
  });

  it("keeps the local script when another machine's version can't be saved", async () => {
    const { engine, service, send, dataStore } = await setup();
    await send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    await engine.run();
    service.write("scripts", "script-one", { schemaVersion: 1, ...script({ name: "Renamed" }) });
    dataStore.failDurable = true;
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([script()]);
    expect(engine.getIssues()).toMatchObject([{ kind: "not-applied", message: /no space left/ }]);
    dataStore.failDurable = false;
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([script({ name: "Renamed" })]);
  });

  it("keeps a removed script's domain when another machine brings it back elsewhere", async () => {
    const { engine, service, send } = await setup();
    await send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    await engine.run();
    await send("domain-scripts:remove", { id: "script-one" });
    await engine.run();
    service.write("scripts", "script-one", {
      schemaVersion: 1,
      ...script({ domain: "other.org", runAt: "page-load" }),
    });
    await engine.run();
    expect(await send(DOMAIN_SCRIPTS_LIST, {})).toEqual([]);
    expect(engine.getIssues()[0]?.message).toMatch(/A script's domain can't change/);
  });
});

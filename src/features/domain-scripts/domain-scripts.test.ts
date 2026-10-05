import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import type { Tab } from "../tabs/tabs.shared";
import feature, {
  DOMAIN_SCRIPTS_SETTING,
  type DomainScriptsDeps,
  type PageSnapshot,
} from "./domain-scripts.main";
import {
  DOMAIN_SCRIPTS_ACTIONS,
  DOMAIN_SCRIPTS_CHANGED,
  DOMAIN_SCRIPTS_EXECUTED,
  DOMAIN_SCRIPTS_LIST,
  DOMAIN_SCRIPTS_REMOVE,
  DOMAIN_SCRIPTS_RUN,
  DOMAIN_SCRIPTS_RUN_ALIAS,
  DOMAIN_SCRIPTS_SAVE,
  type DomainScript,
  type DomainScriptsCommands,
} from "./domain-scripts.shared";
import { matchesScript } from "./matching";

const tabId = "test-tab" as TabId;
const childId = "child-tab" as TabId;
function script(overrides: Partial<DomainScript> = {}): DomainScript {
  return {
    id: "script-one",
    domain: "example.com",
    name: "Copy title",
    source: "copy(document.title)",
    enabled: true,
    runAt: "manual",
    pathPattern: "/*",
    alias: "/copy-title",
    shortcut: "",
    ...overrides,
  };
}

async function setup(saved: DomainScript[] = []) {
  const commands = new CommandBus<DomainScriptsCommands>();
  const events: DomainScriptsDeps["events"] = new EventBus();
  const dataStore = new MemoryDataStore();
  await dataStore.setSetting(DOMAIN_SCRIPTS_SETTING, saved);
  const pages = new Map<TabId, PageSnapshot>([
    [tabId, { url: "https://example.com/articles/1", loading: false }],
  ]);
  const tabListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const shortcuts = new Map<string, () => boolean>();
  const executeWebsiteScript = vi.fn<Platform["executeWebsiteScript"]>(async () => ({}));
  const platform = createMockPlatform({
    executeWebsiteScript,
    getTabUrl: vi.fn((id) => pages.get(id)?.url),
    onTabEvent: vi.fn((id, event, callback) => {
      const key = `${id}:${event}`;
      const callbacks = tabListeners.get(key) ?? new Set();
      callbacks.add(callback);
      tabListeners.set(key, callbacks);
      return () => {
        callbacks.delete(callback);
      };
    }),
    registerWebsiteShortcut: vi.fn((accelerator, callback) => {
      const chord = accelerator.toLowerCase().replace("control", "ctrl");
      if (chord === "ctrl+t" || shortcuts.has(chord))
        throw new Error("Shortcut is already reserved.");
      shortcuts.set(chord, callback);
      return () => {
        shortcuts.delete(chord);
      };
    }),
  });
  let active: TabId | undefined = tabId;
  const deps: DomainScriptsDeps = {
    commands,
    events,
    platform,
    dataStore,
    getPageSnapshots: () => pages,
    getActivePageTabId: () => active,
  };
  feature.register(deps);
  await feature.start?.(deps);
  return {
    commands,
    events,
    dataStore,
    platform,
    pages,
    shortcuts,
    executeWebsiteScript,
    deps,
    setActive(id: TabId | undefined) {
      active = id;
    },
    native(id: TabId, event: string, ...args: unknown[]) {
      for (const callback of tabListeners.get(`${id}:${event}`) ?? []) callback(...args);
    },
    update(id: TabId, snapshot: PageSnapshot) {
      pages.set(id, snapshot);
      events.emit("tabs:updated", { tab: { id, ...snapshot } as Tab });
    },
  };
}

afterEach(() => feature.teardown?.());

describe("domain website scripts", () => {
  it("persists scripts, normalizes aliases and restores them after registration", async () => {
    const context = await setup();
    const saved = await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ domain: "Example.COM", alias: "/Copy-Title" }),
    });
    expect(saved.domain).toBe("example.com");
    expect(saved.alias).toBe("/copy-title");
    expect(await context.dataStore.getSetting(DOMAIN_SCRIPTS_SETTING)).toEqual([saved]);
    const restarted = await setup([saved]);
    expect(await restarted.commands.send(DOMAIN_SCRIPTS_LIST, { domain: "example.com" })).toEqual([
      saved,
    ]);
  });

  it("anchors pathname globs, escapes regex characters and matches exact HTTP hostnames", () => {
    const scoped = script({ pathPattern: "/articles/*" });
    expect(matchesScript(scoped, "https://example.com/articles/1?q=yes#end")).toBe(true);
    expect(matchesScript(scoped, "https://example.com/other/articles/1")).toBe(false);
    expect(matchesScript(scoped, "https://sub.example.com/articles/1")).toBe(false);
    expect(matchesScript(scoped, "https://example.com.evil.test/articles/1")).toBe(false);
    expect(matchesScript(scoped, "file:///articles/1")).toBe(false);
    expect(matchesScript(script({ pathPattern: "/a.b" }), "https://example.com/a-b")).toBe(false);
  });

  it("rejects browser route aliases, duplicate aliases, invalid domains and invalid paths", async () => {
    const { commands } = await setup([script()]);
    await expect(
      commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ id: "another" }) }),
    ).rejects.toThrow("already used");
    await expect(
      commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ alias: "/settings" }) }),
    ).rejects.toThrow("reserved");
    await expect(
      commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ domain: "https://example.com" }) }),
    ).rejects.toThrow("hostname");
    await expect(
      commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ pathPattern: "articles/*" }) }),
    ).rejects.toThrow("start with /");
    const other = script({ id: "other-host", domain: "other.test" });
    await commands.send(DOMAIN_SCRIPTS_SAVE, { script: other });
  });

  it("runs aliases and actions on the topmost selected matching page and copies results", async () => {
    const context = await setup([script()]);
    context.pages.set(childId, { url: "https://example.com/child", loading: false });
    context.setActive(childId);
    context.executeWebsiteScript.mockResolvedValue({ clipboard: "# Issue" });
    expect(await context.commands.send(DOMAIN_SCRIPTS_ACTIONS, { query: "title" })).toEqual([
      { id: "script-one", name: "Copy title", alias: "/copy-title", shortcut: "" },
    ]);
    expect(await context.commands.send(DOMAIN_SCRIPTS_RUN_ALIAS, { alias: "/COPY-TITLE" })).toEqual(
      { handled: true },
    );
    expect(context.executeWebsiteScript).toHaveBeenCalledWith(childId, {
      source: "copy(document.title)",
      expectedUrl: "https://example.com/child",
      userGesture: true,
    });
    expect(context.platform.writeClipboard).toHaveBeenCalledWith("# Issue");
    context.pages.set(childId, { url: "https://unrelated.test/", loading: false });
    expect(await context.commands.send(DOMAIN_SCRIPTS_RUN_ALIAS, { alias: "/copy-title" })).toEqual(
      { handled: false },
    );
    expect(await context.commands.send(DOMAIN_SCRIPTS_ACTIONS, {})).toEqual([]);
    await expect(context.commands.send(DOMAIN_SCRIPTS_RUN, { id: "script-one" })).rejects.toThrow(
      "does not match",
    );
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(1);
  });

  it("reports execution errors and never copies failed results", async () => {
    const context = await setup([script()]);
    const result = vi.fn();
    context.events.on(DOMAIN_SCRIPTS_EXECUTED, result);
    context.executeWebsiteScript.mockRejectedValue(new Error("SyntaxError: unexpected token"));
    await expect(context.commands.send(DOMAIN_SCRIPTS_RUN, { id: "script-one" })).rejects.toThrow(
      "unexpected token",
    );
    expect(result).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "SyntaxError: unexpected token",
        id: "script-one",
      }),
    );
    expect(context.platform.writeClipboard).not.toHaveBeenCalled();
  });

  it("rejects stale clipboard output after navigation or disabling a pending script", async () => {
    const context = await setup([script()]);
    let finish: (value: { clipboard: string }) => void = () => {};
    context.executeWebsiteScript.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = context.commands.send(DOMAIN_SCRIPTS_RUN, { id: "script-one" });
    context.pages.set(tabId, { url: "https://unrelated.test/", loading: false });
    finish({ clipboard: "stale" });
    await expect(running).rejects.toThrow("navigated");
    context.pages.set(tabId, { url: "https://example.com/", loading: false });
    const disabled = context.commands.send(DOMAIN_SCRIPTS_RUN, { id: "script-one" });
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ enabled: false }) });
    finish({ clipboard: "disabled" });
    await expect(disabled).rejects.toThrow("changed while");
    expect(context.platform.writeClipboard).not.toHaveBeenCalled();
  });

  it("restores automatic scripts and runs once per load rather than per metadata update", async () => {
    const context = await setup([script({ runAt: "page-load", alias: "" })]);
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(1);
    context.update(tabId, { url: "https://example.com/articles/1", loading: false });
    context.native(tabId, "did-finish-load");
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(1);
    context.native(
      tabId,
      "did-start-navigation",
      {},
      "https://example.com/articles/1",
      false,
      true,
    );
    context.update(tabId, { url: "https://example.com/articles/1", loading: true });
    context.native(tabId, "did-finish-load");
    await vi.waitFor(() => expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2));
    expect(context.executeWebsiteScript).toHaveBeenLastCalledWith(
      tabId,
      expect.objectContaining({ userGesture: false }),
    );
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ runAt: "page-load", enabled: false, alias: "" }),
    });
    context.update(tabId, { url: "https://example.com/articles/1", loading: true });
    context.update(tabId, { url: "https://example.com/articles/1", loading: false });
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2);
  });

  it("runs automatic scripts on already loaded child tabs and skips unrelated child pages", async () => {
    const context = await setup([script({ runAt: "page-load", alias: "" })]);
    context.pages.set(childId, { url: "https://example.com/child", loading: false });
    context.events.emit("sub-tabs:opened", {
      parentTabId: tabId,
      subTab: {
        id: childId,
        parentTabId: tabId,
        url: "https://example.com/child",
        loading: false,
        title: "Child",
        favicon: "",
      },
    });
    await vi.waitFor(() => expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2));
    context.native(childId, "did-start-navigation", {}, "https://other.test/", false, true);
    context.pages.set(childId, { url: "https://other.test/", loading: false });
    context.native(childId, "did-finish-load");
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2);
    context.events.emit("sub-tabs:closed", { parentTabId: tabId, subTabId: childId });
    context.native(childId, "did-finish-load");
    expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2);
  });

  it("waits for native load completion when metadata finishes early", async () => {
    const context = await setup();
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ runAt: "page-load", alias: "" }),
    });
    vi.mocked(context.platform.isTabLoading).mockReturnValue(true);
    context.update(tabId, { url: "https://example.com/articles/1", loading: true });
    context.update(tabId, { url: "https://example.com/articles/1", loading: false });
    expect(context.executeWebsiteScript).not.toHaveBeenCalled();
    vi.mocked(context.platform.isTabLoading).mockReturnValue(false);
    context.native(tabId, "did-finish-load");
    await vi.waitFor(() => expect(context.executeWebsiteScript).toHaveBeenCalledOnce());
  });

  it("does not rerun automatic scripts when only an iframe starts loading", async () => {
    const context = await setup([script({ runAt: "page-load", alias: "" })]);
    expect(context.executeWebsiteScript).toHaveBeenCalledOnce();
    vi.mocked(context.platform.isTabLoading).mockReturnValue(false);
    context.update(tabId, { url: "https://example.com/articles/1", loading: true });
    context.update(tabId, { url: "https://example.com/articles/1", loading: false });
    expect(context.executeWebsiteScript).toHaveBeenCalledOnce();
  });

  it("uses main-frame document navigation events and ignores same-document routes", async () => {
    const context = await setup([script({ runAt: "page-load", alias: "" })]);
    context.native(tabId, "did-start-navigation", { isMainFrame: true, isSameDocument: true });
    context.native(tabId, "did-finish-load");
    expect(context.executeWebsiteScript).toHaveBeenCalledOnce();
    context.native(tabId, "did-start-navigation", { isMainFrame: false, isSameDocument: false });
    context.native(tabId, "did-finish-load");
    expect(context.executeWebsiteScript).toHaveBeenCalledOnce();
    context.native(tabId, "did-start-navigation", { isMainFrame: true, isSameDocument: false });
    context.native(tabId, "did-finish-load");
    await vi.waitFor(() => expect(context.executeWebsiteScript).toHaveBeenCalledTimes(2));
  });

  it("preserves state and shortcuts if persistence fails, including removal", async () => {
    const initial = script({ shortcut: "Control+Shift+Y" });
    const context = await setup([initial]);
    const changed = vi.fn();
    context.events.on(DOMAIN_SCRIPTS_CHANGED, changed);
    vi.spyOn(context.dataStore, "setSetting").mockRejectedValue(new Error("Disk full"));
    await expect(
      context.commands.send(DOMAIN_SCRIPTS_SAVE, {
        script: script({ shortcut: "Control+Shift+U" }),
      }),
    ).rejects.toThrow("Disk full");
    expect(await context.commands.send(DOMAIN_SCRIPTS_LIST, {})).toEqual([initial]);
    expect(context.shortcuts.has("ctrl+shift+y")).toBe(true);
    expect(context.shortcuts.has("ctrl+shift+u")).toBe(false);
    await expect(context.commands.send(DOMAIN_SCRIPTS_REMOVE, { id: initial.id })).rejects.toThrow(
      "Disk full",
    );
    expect(context.shortcuts.has("ctrl+shift+y")).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects browser/other script shortcut collisions and releases disabled or removed shortcuts", async () => {
    const context = await setup();
    await expect(
      context.commands.send(DOMAIN_SCRIPTS_SAVE, { script: script({ shortcut: "Control+T" }) }),
    ).rejects.toThrow("reserved");
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ shortcut: "Control+Shift+Y" }),
    });
    await expect(
      context.commands.send(DOMAIN_SCRIPTS_SAVE, {
        script: script({ id: "two", alias: "/two", shortcut: "Ctrl+Shift+Y" }),
      }),
    ).rejects.toThrow("reserved");
    expect(context.shortcuts.get("ctrl+shift+y")?.()).toBe(true);
    await vi.waitFor(() => expect(context.executeWebsiteScript).toHaveBeenCalledOnce());
    context.pages.set(tabId, { url: "https://unrelated.test/", loading: false });
    expect(context.shortcuts.get("ctrl+shift+y")?.()).toBe(false);
    expect(context.executeWebsiteScript).toHaveBeenCalledOnce();
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ shortcut: "Control+Shift+Y", enabled: false }),
    });
    expect(context.shortcuts.size).toBe(0);
    await context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ shortcut: "Control+Shift+Y" }),
    });
    await context.commands.send(DOMAIN_SCRIPTS_REMOVE, { id: "script-one" });
    expect(context.shortcuts.size).toBe(0);
    expect(await context.commands.send(DOMAIN_SCRIPTS_LIST, {})).toEqual([]);
  });

  it("serializes concurrent writes and recovers the mutation queue after an error", async () => {
    const context = await setup();
    const original = context.dataStore.setSetting.bind(context.dataStore);
    vi.spyOn(context.dataStore, "setSetting")
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockImplementation(original);
    const rejected = context.commands.send(DOMAIN_SCRIPTS_SAVE, { script: script() });
    const first = context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ id: "two", alias: "/two" }),
    });
    const second = context.commands.send(DOMAIN_SCRIPTS_SAVE, {
      script: script({ id: "three", alias: "/three" }),
    });
    await expect(rejected).rejects.toThrow("Temporary failure");
    await Promise.all([first, second]);
    expect(await context.dataStore.getSetting<DomainScript[]>(DOMAIN_SCRIPTS_SETTING)).toHaveLength(
      2,
    );
    expect(await context.commands.send(DOMAIN_SCRIPTS_LIST, {})).toHaveLength(2);
  });
});

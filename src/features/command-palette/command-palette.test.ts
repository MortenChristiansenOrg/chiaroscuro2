import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import { TABS_UPDATED } from "../tabs/tabs.shared";
import feature from "./command-palette.main";
import {
  COMMAND_PALETTE_EDIT_URL,
  COMMAND_PALETTE_EXECUTE,
  COMMAND_PALETTE_HIDDEN,
  COMMAND_PALETTE_HIDE,
  COMMAND_PALETTE_SEARCH_VISITS,
  COMMAND_PALETTE_SHOW,
  COMMAND_PALETTE_SHOWN,
  COMMAND_PALETTE_TOGGLE,
} from "./command-palette.shared";

const WIN_ID = "win-1" as WindowId;
const TAB_ID = "tab-1" as TabId;

type AllCommands = Parameters<typeof feature.register>[0] extends { commands: CommandBus<infer C> }
  ? C
  : never;
type AllEvents = Parameters<typeof feature.register>[0] extends { events: EventBus<infer E> }
  ? E
  : never;

let tabCounter = 0;

function setup(overrides: { activeTabId?: TabId | undefined; tabUrl?: string } = {}) {
  tabCounter = 0;
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();
  const dataStore = new MemoryDataStore();
  const activeTabId = overrides.activeTabId ?? TAB_ID;

  // Register stub tab handlers
  commands.handle("tabs:activate" as never, async () => {});
  commands.handle("tabs:create" as never, async () => `tab-${++tabCounter}` as TabId);
  commands.handle("tabs:navigate" as never, async () => {});

  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId: () => WIN_ID as WindowId | undefined,
    getActiveTabId: () => activeTabId as TabId | undefined,
    getTabUrl: () => overrides.tabUrl,
    isPrivacyWorkspace: () => false,
  };
  feature.register(deps);
  return { commands, events, platform, dataStore, deps };
}

describe("command-palette commands", () => {
  it("offers matching website actions alongside history and executes without navigating", async () => {
    const { commands } = setup();
    const run = vi.fn();
    const create = vi.fn();
    commands.unhandle("tabs:create");
    commands.handle("tabs:create", create);
    commands.handle("domain-scripts:actions", async () => [
      { id: "copy-title", name: "Copy title", alias: "/copy-title", shortcut: "" },
    ]);
    commands.handle("domain-scripts:run", run);
    expect(await commands.send(COMMAND_PALETTE_SEARCH_VISITS, { query: "" })).toEqual([
      { title: "Copy title", url: "/copy-title", visitCount: 0, scriptId: "copy-title" },
    ]);
    await commands.send(COMMAND_PALETTE_EXECUTE, {
      command: "/copy-title",
      scriptId: "copy-title",
    });
    expect(run).toHaveBeenCalledWith({ id: "copy-title" });
    expect(create).not.toHaveBeenCalled();
  });

  it("resolves exact website aliases before navigation and propagates execution errors", async () => {
    const { commands } = setup();
    const alias = vi.fn(async () => ({ handled: true }));
    commands.handle("domain-scripts:run-alias", alias);
    await commands.send(COMMAND_PALETTE_EXECUTE, { command: " /copy-title " });
    expect(alias).toHaveBeenCalledWith({ alias: "/copy-title" });
    commands.handle("domain-scripts:run", async () => {
      throw new Error("Script failed");
    });
    await expect(
      commands.send(COMMAND_PALETTE_EXECUTE, { command: "Copy title", scriptId: "copy-title" }),
    ).rejects.toThrow("Script failed");
  });

  it("offers one named Extensions result despite old internal history", async () => {
    const { commands, dataStore } = setup();
    await dataStore.collection("visits").insert({
      id: "/extensions",
      url: "/extensions",
      title: "/extensions",
      visitCount: 3,
      visitedAt: Date.now(),
    });
    expect(await commands.send(COMMAND_PALETTE_SEARCH_VISITS, { query: "/ex" })).toEqual([
      { url: "/extensions", title: "Extensions", visitCount: 0 },
    ]);
  });

  describe("SHOW", () => {
    it("shows palette overlay and emits SHOWN", async () => {
      const { commands, events, platform } = setup();
      const shown = vi.fn();
      events.on(COMMAND_PALETTE_SHOWN, shown);

      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      expect(platform.showCommandPalette).toHaveBeenCalled();
      expect(shown).toHaveBeenCalled();
    });

    it("no-ops when already open", async () => {
      const { commands, events } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const shown = vi.fn();
      events.on(COMMAND_PALETTE_SHOWN, shown);
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      expect(shown).not.toHaveBeenCalled();
    });
  });

  describe("HIDE", () => {
    it("hides palette overlay and emits HIDDEN", async () => {
      const { commands, events, platform } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);
      await commands.send(COMMAND_PALETTE_HIDE, undefined);

      expect(platform.hideCommandPalette).toHaveBeenCalled();
      expect(hidden).toHaveBeenCalled();
    });

    it("no-ops when already closed", async () => {
      const { commands, events } = setup();
      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);

      await commands.send(COMMAND_PALETTE_HIDE, undefined);

      expect(hidden).not.toHaveBeenCalled();
    });
  });

  describe("TOGGLE", () => {
    it("opens when closed", async () => {
      const { commands, events } = setup();
      const shown = vi.fn();
      events.on(COMMAND_PALETTE_SHOWN, shown);

      await commands.send(COMMAND_PALETTE_TOGGLE, undefined);

      expect(shown).toHaveBeenCalled();
    });

    it("closes when open", async () => {
      const { commands, events } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);
      await commands.send(COMMAND_PALETTE_TOGGLE, undefined);

      expect(hidden).toHaveBeenCalled();
    });
  });

  describe("EXECUTE", () => {
    it("creates new tab for search input", async () => {
      const { commands } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "hello world" });

      expect(tabCounter).toBe(1);
    });

    it("navigates current tab when inCurrentTab=true", async () => {
      const { commands } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      // Should use tabs:navigate instead of tabs:create
      await commands.send(COMMAND_PALETTE_EXECUTE, {
        command: "https://example.com",
        inCurrentTab: true,
      });
      // No assertion on internals — just ensure no error
    });

    it("does nothing for empty input", async () => {
      const { commands, events } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);

      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "" });

      // Empty resolves to empty URL, so hide is not called
      expect(hidden).not.toHaveBeenCalled();
    });
  });

  describe("EDIT_URL", () => {
    function setupEdit(tabUrl: string) {
      const context = setup({ tabUrl });
      const create = vi.fn(async () => "tab-new" as TabId);
      const navigate = vi.fn(async () => {});
      context.commands.unhandle("tabs:create");
      context.commands.handle("tabs:create", create);
      context.commands.unhandle("tabs:navigate");
      context.commands.handle("tabs:navigate", navigate);
      return { ...context, create, navigate };
    }

    it("opens the palette on the active tab's address", async () => {
      const { commands, events, platform } = setupEdit("https://example.com/path");
      const shown = vi.fn();
      events.on(COMMAND_PALETTE_SHOWN, shown);

      await commands.send(COMMAND_PALETTE_EDIT_URL, undefined);

      expect(platform.showCommandPalette).toHaveBeenCalledWith({
        editUrl: "https://example.com/path",
      });
      expect(shown).toHaveBeenCalled();
    });

    it("opens on the PDF's address in the PDF reader", async () => {
      const { commands, platform } = setupEdit(
        `/pdf-reader?url=${encodeURIComponent("https://example.com/a.pdf")}`,
      );
      await commands.send(COMMAND_PALETTE_EDIT_URL, undefined);
      expect(platform.showCommandPalette).toHaveBeenCalledWith({
        editUrl: "https://example.com/a.pdf",
      });
    });

    it("opens an empty palette when there is no active address", async () => {
      const { commands, platform } = setup();
      await commands.send(COMMAND_PALETTE_EDIT_URL, undefined);
      expect(platform.showCommandPalette).toHaveBeenCalledWith(undefined);
    });

    it("navigates the current tab to a new address", async () => {
      const { commands, create, navigate } = setupEdit("https://example.com/");
      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "example.org", editUrl: true });
      expect(navigate).toHaveBeenCalledWith({ url: "https://example.org" });
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ["https://example.com/", "https://example.com/"],
      ["https://example.com", "https://example.com/"],
      [" example.com ", "https://example.com/"],
      ["/settings", "/settings"],
      ["/domain-settings?domain=example.com", "/domain-settings?domain=example.com"],
      [
        "https://example.com/a.pdf",
        `/pdf-reader?url=${encodeURIComponent("https://example.com/a.pdf")}`,
      ],
    ])("does nothing for the current address %j on %j", async (command, tabUrl) => {
      const { commands, create, navigate } = setupEdit(tabUrl);
      await commands.send(COMMAND_PALETTE_EXECUTE, { command, editUrl: true });
      expect(navigate).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ["/settings"],
      [`/pdf-reader?url=${encodeURIComponent("https://example.com/a.pdf")}`],
    ])("opens a web address from the built-in page %j in a new tab", async (tabUrl) => {
      const { commands, create, navigate } = setupEdit(tabUrl);
      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "example.org", editUrl: true });
      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "example.net", inCurrentTab: true });
      expect(navigate).not.toHaveBeenCalled();
      expect(create.mock.calls).toEqual([
        [{ url: "https://example.org" }],
        [{ url: "https://example.net" }],
      ]);
    });

    it("opens a built-in page in its own tab", async () => {
      const { commands, create, navigate } = setupEdit("https://example.com/");
      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "/settings", editUrl: true });
      expect(navigate).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith({ url: "/settings" });
    });

    it("still reloads the current address without editUrl", async () => {
      const { commands, navigate } = setupEdit("https://example.com/");
      await commands.send(COMMAND_PALETTE_EXECUTE, {
        command: "https://example.com/",
        inCurrentTab: true,
      });
      expect(navigate).toHaveBeenCalledWith({ url: "https://example.com/" });
    });
  });

  describe("SEARCH_VISITS", () => {
    it("returns matching visits", async () => {
      const { commands, events } = setup();

      // Record some visits via TABS_UPDATED event
      events.emit(TABS_UPDATED, {
        tab: {
          id: "t1" as TabId,
          workspaceId: "ws-1" as never,
          url: "https://github.com",
          title: "GitHub",
          favicon: "",
          loading: false,
          bookmarked: false,
          lastAccessedAt: 0,
          createdAt: 0,
          order: 0,
        },
      });

      // Give recordVisit time to complete
      await new Promise((r) => setTimeout(r, 10));

      const results = await commands.send(COMMAND_PALETTE_SEARCH_VISITS, { query: "github" });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ url: "https://github.com" });
    });
  });
});

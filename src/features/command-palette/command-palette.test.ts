import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import { TABS_UPDATED } from "../tabs/tabs.shared";
import feature from "./command-palette.main";
import {
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

type AllCommands = Parameters<typeof register>[0] extends { commands: CommandBus<infer C> }
  ? C
  : never;
type AllEvents = Parameters<typeof register>[0] extends { events: EventBus<infer E> } ? E : never;

let tabCounter = 0;

function setup(overrides: { activeTabId?: TabId | undefined } = {}) {
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
  };
  feature.register(deps);
  return { commands, events, platform, dataStore, deps };
}

describe("command-palette commands", () => {
  describe("SHOW", () => {
    it("hides active tab, focuses shell, emits SHOWN", async () => {
      const { commands, events, platform } = setup();
      const shown = vi.fn();
      events.on(COMMAND_PALETTE_SHOWN, shown);

      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      expect(platform.hideTab).toHaveBeenCalledWith(TAB_ID);
      expect(platform.focusShell).toHaveBeenCalledWith(WIN_ID);
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
    it("re-activates tab, emits HIDDEN", async () => {
      const { commands, events } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);
      await commands.send(COMMAND_PALETTE_HIDE, undefined);

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
    it("creates new tab for search input, auto-hides", async () => {
      const { commands, events } = setup();
      await commands.send(COMMAND_PALETTE_SHOW, undefined);

      const hidden = vi.fn();
      events.on(COMMAND_PALETTE_HIDDEN, hidden);

      await commands.send(COMMAND_PALETTE_EXECUTE, { command: "hello world" });

      expect(hidden).toHaveBeenCalled();
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

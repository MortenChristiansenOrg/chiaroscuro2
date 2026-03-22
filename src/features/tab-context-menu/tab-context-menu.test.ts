import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { Bounds, TabId } from "../../shared/types";
import { createMockPlatform, makeTab } from "../../test-utils";
import { CONTEXT_MENU_SHOW, type ContextMenuCommands } from "../context-menu/context-menu.shared";
import { SETTINGS_GET, type Settings, type SettingsCommands } from "../settings/settings.shared";
import {
  TABS_CLOSED,
  TABS_CONTENT_BOUNDS_CHANGED,
  TABS_CREATE,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  type TabsClosedEvent,
  type TabsCommands,
  type TabsCreatedEvent,
  type TabsListChangedEvent,
} from "../tabs/tabs.shared";
import feature from "./tab-context-menu.main";
import {
  TAB_CONTEXT_MENU_COPY_IMAGE,
  TAB_CONTEXT_MENU_COPY_TEXT,
  TAB_CONTEXT_MENU_DOWNLOAD_IMAGE,
  TAB_CONTEXT_MENU_SEARCH_TEXT,
  type TabContextMenuCommands,
} from "./tab-context-menu.shared";

const TAB_ID = "tab-1" as TabId;

type AllCommands = TabContextMenuCommands & ContextMenuCommands & SettingsCommands & TabsCommands;
type AllEvents = { [K in typeof TABS_CREATED]: TabsCreatedEvent } & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
} & { [K in typeof TABS_CONTENT_BOUNDS_CHANGED]: Bounds } & {
  [K in typeof TABS_LIST_CHANGED]: TabsListChangedEvent;
};

const DEFAULT_SETTINGS: Settings = {
  searchProviders: [
    {
      id: "builtin-google",
      bang: "!g",
      name: "Google",
      urlTemplate: "https://www.google.com/search?q={query}",
    },
  ],
  defaultSearchProviderId: "!g",
  debugServer: { enabled: false, port: 9222 },
};

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();

  // Track onTabEvent callbacks by event type
  const tabEventCallbacks = new Map<string, (...args: unknown[]) => void>();

  const platform = createMockPlatform({
    onTabEvent: vi.fn((_, event: string, cb: (...args: unknown[]) => void) => {
      tabEventCallbacks.set(event, cb);
      return () => {
        tabEventCallbacks.delete(event);
      };
    }),
    showContextMenu: vi.fn(async () => -1),
    executeJavaScript: vi.fn(async () => false),
  });

  // Register settings handler
  commands.handle(SETTINGS_GET, async () => DEFAULT_SETTINGS);
  // Register tabs:create handler
  commands.handle(TABS_CREATE, async () => TAB_ID);
  // Register context menu show handler
  commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
    return platform.showContextMenu(payload);
  });

  feature.register({ commands, events, platform });

  return { commands, events, platform, tabEventCallbacks };
}

function emitTabCreated(events: EventBus<AllEvents>, tabId = TAB_ID) {
  const tab = makeTab({ id: tabId });
  events.emit(TABS_CREATED, { tab });
}

async function triggerContextMenu(
  tabEventCallbacks: Map<string, (...args: unknown[]) => void>,
  params: Partial<{
    x: number;
    y: number;
    linkURL: string;
    srcURL: string;
    mediaType: string;
    selectionText: string;
  }> = {},
) {
  const cb = tabEventCallbacks.get("context-menu");
  if (!cb) throw new Error("No context-menu callback registered");
  const fullParams = {
    x: 100,
    y: 200,
    linkURL: "",
    srcURL: "",
    mediaType: "",
    selectionText: "",
    ...params,
  };
  cb({}, fullParams);
  // Wait for async handleContextMenu to complete
  await new Promise((r) => setTimeout(r, 10));
}

describe("tab-context-menu", () => {
  describe("listener attachment", () => {
    it("attaches context-menu and did-finish-load listeners on tab creation", () => {
      const { events, platform } = setup();
      emitTabCreated(events);

      expect(platform.onTabEvent).toHaveBeenCalledWith(
        TAB_ID,
        "did-finish-load",
        expect.any(Function),
      );
      expect(platform.onTabEvent).toHaveBeenCalledWith(
        TAB_ID,
        "context-menu",
        expect.any(Function),
      );
    });

    it("skips built-in tabs", () => {
      const { events, platform } = setup();
      const tab = makeTab({ id: "builtin-1" as TabId, builtIn: true });
      events.emit(TABS_CREATED, { tab });

      expect(platform.onTabEvent).not.toHaveBeenCalledWith(
        "builtin-1",
        "context-menu",
        expect.any(Function),
      );
    });

    it("cleans up listeners on tab close", () => {
      const { events, tabEventCallbacks } = setup();
      emitTabCreated(events);

      expect(tabEventCallbacks.size).toBeGreaterThan(0);

      events.emit(TABS_CLOSED, { tabId: TAB_ID, activatedTabId: null });
      expect(tabEventCallbacks.size).toBe(0);
    });
  });

  describe("context detection", () => {
    it("does nothing when page prevented contextmenu", async () => {
      const { events, platform, tabEventCallbacks } = setup();
      (platform.executeJavaScript as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      emitTabCreated(events);

      await triggerContextMenu(tabEventCallbacks);

      expect(platform.showContextMenu).not.toHaveBeenCalled();
    });

    it("does nothing when no actionable context", async () => {
      const { events, platform, tabEventCallbacks } = setup();
      emitTabCreated(events);

      await triggerContextMenu(tabEventCallbacks);

      expect(platform.showContextMenu).not.toHaveBeenCalled();
    });
  });

  describe("selected text context", () => {
    it("shows Copy and Search items for selected text", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      // Re-register context menu handler to return selected index
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
        expect(payload.items).toHaveLength(2);
        expect(payload.items[0]).toEqual({ label: "Copy", icon: "copy" });
        expect(payload.items[1]).toEqual({ label: "Search with Google", icon: "magnifying-glass" });
        return -1; // dismiss
      });

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { selectionText: "hello world" });
    });

    it("executes copy text when first item selected", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async () => 0); // select first item (Copy)

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { selectionText: "  hello  " });

      // Wait for action callback
      await new Promise((r) => setTimeout(r, 10));
      expect(platform.writeClipboard).toHaveBeenCalledWith("  hello  ");
    });

    it("executes search when second item selected", async () => {
      const { events, commands, tabEventCallbacks } = setup();
      const createSpy = vi.fn(async () => TAB_ID);
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.unhandle?.(TABS_CREATE);
      commands.handle(CONTEXT_MENU_SHOW, async () => 1); // select Search
      commands.handle(TABS_CREATE, createSpy);

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { selectionText: "test query" });

      // Wait for action callbacks
      await new Promise((r) => setTimeout(r, 10));
      expect(createSpy).toHaveBeenCalledWith({
        url: "https://www.google.com/search?q=test%20query",
      });
    });
  });

  describe("link context", () => {
    it("shows Copy link item for links", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toEqual({ label: "Copy link", icon: "copy" });
        return -1;
      });

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { linkURL: "https://example.com" });
    });

    it("copies link URL when selected", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async () => 0);

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { linkURL: "https://example.com/page" });

      await new Promise((r) => setTimeout(r, 10));
      expect(platform.writeClipboard).toHaveBeenCalledWith("https://example.com/page");
    });
  });

  describe("image context", () => {
    it("shows Copy image and Download image items", async () => {
      const { events, commands, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
        expect(payload.items).toHaveLength(2);
        expect(payload.items[0]).toEqual({ label: "Copy image", icon: "copy" });
        expect(payload.items[1]).toEqual({ label: "Download image", icon: "download" });
        return -1;
      });

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, {
        mediaType: "image",
        srcURL: "https://example.com/img.png",
      });
    });

    it("copies image when first item selected", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async () => 0);

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, {
        mediaType: "image",
        srcURL: "https://example.com/img.png",
        x: 150,
        y: 250,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(platform.copyImageAt).toHaveBeenCalledWith(TAB_ID, 150, 250);
    });

    it("downloads image when second item selected", async () => {
      const { events, commands, platform, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async () => 1);

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, {
        mediaType: "image",
        srcURL: "https://example.com/img.png",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(platform.downloadUrl).toHaveBeenCalledWith(TAB_ID, "https://example.com/img.png");
    });
  });

  describe("combined contexts", () => {
    it("shows items for selection + link + image", async () => {
      const { events, commands, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
        // Selection: Copy, Search | Link: Copy link | Image: Copy image, Download image
        expect(payload.items).toHaveLength(5);
        expect(payload.items.map((i: { label: string }) => i.label)).toEqual([
          "Copy",
          "Search with Google",
          "Copy link",
          "Copy image",
          "Download image",
        ]);
        return -1;
      });

      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, {
        selectionText: "text",
        linkURL: "https://example.com",
        mediaType: "image",
        srcURL: "https://example.com/img.png",
      });
    });
  });

  describe("content bounds offset", () => {
    it("offsets menu coordinates by content bounds", async () => {
      const { events, commands, tabEventCallbacks } = setup();
      commands.unhandle?.(CONTEXT_MENU_SHOW);
      commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
        expect(payload.x).toBe(100 + 50);
        expect(payload.y).toBe(200 + 80);
        return -1;
      });

      events.emit(TABS_CONTENT_BOUNDS_CHANGED, { x: 50, y: 80, width: 800, height: 600 });
      emitTabCreated(events);
      await triggerContextMenu(tabEventCallbacks, { selectionText: "text" });
    });
  });

  describe("restored tab attachment", () => {
    it("attaches listeners to restored tabs via TABS_LIST_CHANGED", () => {
      const { events, platform } = setup();
      const restoredTab = makeTab({ id: "restored-1" as TabId });

      events.emit(TABS_LIST_CHANGED, { tabs: [restoredTab] });

      expect(platform.onTabEvent).toHaveBeenCalledWith(
        "restored-1",
        "context-menu",
        expect.any(Function),
      );
    });

    it("skips already-tracked tabs in TABS_LIST_CHANGED", () => {
      const { events, platform } = setup();
      emitTabCreated(events);

      (platform.onTabEvent as ReturnType<typeof vi.fn>).mockClear();
      events.emit(TABS_LIST_CHANGED, { tabs: [makeTab({ id: TAB_ID })] });

      expect(platform.onTabEvent).not.toHaveBeenCalled();
    });

    it("skips built-in tabs in TABS_LIST_CHANGED", () => {
      const { events, platform } = setup();

      events.emit(TABS_LIST_CHANGED, {
        tabs: [makeTab({ id: "builtin-1" as TabId, builtIn: true })],
      });

      expect(platform.onTabEvent).not.toHaveBeenCalledWith(
        "builtin-1",
        "context-menu",
        expect.any(Function),
      );
    });
  });

  describe("command handlers", () => {
    it("copy-text writes to clipboard", async () => {
      const { commands, platform } = setup();
      await commands.send(TAB_CONTEXT_MENU_COPY_TEXT, { text: "hello" });
      expect(platform.writeClipboard).toHaveBeenCalledWith("hello");
    });

    it("copy-image delegates to platform", async () => {
      const { commands, platform } = setup();
      await commands.send(TAB_CONTEXT_MENU_COPY_IMAGE, {
        tabId: TAB_ID,
        x: 100,
        y: 200,
      });
      expect(platform.copyImageAt).toHaveBeenCalledWith(TAB_ID, 100, 200);
    });

    it("download-image delegates to platform", async () => {
      const { commands, platform } = setup();
      await commands.send(TAB_CONTEXT_MENU_DOWNLOAD_IMAGE, {
        url: "https://example.com/img.png",
        tabId: TAB_ID,
      });
      expect(platform.downloadUrl).toHaveBeenCalledWith(TAB_ID, "https://example.com/img.png");
    });

    it("search-text opens new tab with search URL", async () => {
      const { commands } = setup();
      const createSpy = vi.fn(async () => TAB_ID);
      commands.unhandle?.(TABS_CREATE);
      commands.handle(TABS_CREATE, createSpy);

      await commands.send(TAB_CONTEXT_MENU_SEARCH_TEXT, { text: "hello world" });

      expect(createSpy).toHaveBeenCalledWith({
        url: "https://www.google.com/search?q=hello%20world",
      });
    });
  });
});

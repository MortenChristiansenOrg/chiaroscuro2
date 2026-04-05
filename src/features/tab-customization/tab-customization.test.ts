import { describe, expect, it, vi } from "vitest";

const mockIsPinned = vi.fn((_id: unknown) => false);
vi.mock("../pinned-tabs/pinned-tabs.main", () => ({
  isPinned: (...args: unknown[]) => mockIsPinned(...args),
}));

import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { TABS_ACTIVATE } from "../tabs/tabs.shared";
import type { TabCustomizationDeps } from "./tab-customization.main";
import feature from "./tab-customization.main";
import { start } from "./tab-customization.main";
import {
  TAB_CUSTOMIZATION_CHANGED,
  TAB_CUSTOMIZATION_CLOSE,
  TAB_CUSTOMIZATION_CLOSED,
  TAB_CUSTOMIZATION_GET_STATE,
  TAB_CUSTOMIZATION_OPEN,
  TAB_CUSTOMIZATION_OPENED,
  TAB_CUSTOMIZATION_REMOVED,
  TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED,
  TAB_CUSTOMIZATION_SET_NAVIGATION,
  TAB_CUSTOMIZATION_SET_TITLE,
  type TabCustomizationChangedEvent,
  type TabCustomizationCommands,
  type TabCustomizationEvents,
} from "./tab-customization.shared";

type AllCommands = TabCustomizationCommands & Pick<TabsCommands, typeof TABS_ACTIVATE>;
type AllEvents = TabCustomizationEvents & Pick<TabsEvents, "tabs:closed">;

function makeTab(id: string, overrides?: Partial<Tab>): Tab {
  return {
    id: id as TabId,
    workspaceId: "ws-1" as WorkspaceId,
    url: `https://example.com/${id}`,
    title: `Tab ${id}`,
    favicon: "",
    loading: false,
    bookmarked: false,
    lastAccessedAt: Date.now(),
    createdAt: Date.now(),
    order: 0,
    folderId: null,
    ...overrides,
  };
}

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const tabs = new Map<TabId, Tab>();
  tabs.set("tab-1" as TabId, makeTab("tab-1", { bookmarked: true }));
  tabs.set("tab-2" as TabId, makeTab("tab-2", { bookmarked: true }));
  tabs.set("ephemeral-1" as TabId, makeTab("ephemeral-1"));
  tabs.set("builtin-1" as TabId, makeTab("builtin-1", { builtIn: true, url: "app:settings" }));

  const platform = createMockPlatform();
  const deps: TabCustomizationDeps = {
    commands,
    events,
    dataStore,
    platform,
    getTab: (id) => tabs.get(id),
    isPinned: (id) => mockIsPinned(id),
  };

  commands.handle(TABS_ACTIVATE, async () => {});
  feature.register(deps);
  return { commands, events, dataStore, deps, tabs };
}

describe("tab-customization commands", () => {
  describe("TAB_CUSTOMIZATION_OPEN", () => {
    it("emits opened event for valid tab", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_OPENED, listener);

      await commands.send(TAB_CUSTOMIZATION_OPEN, { tabId: "tab-1" as TabId });

      expect(listener).toHaveBeenCalledWith({ tabId: "tab-1" });
    });

    it("throws for non-existent tab", async () => {
      const { commands } = setup();
      await expect(
        commands.send(TAB_CUSTOMIZATION_OPEN, { tabId: "nonexistent" as TabId }),
      ).rejects.toThrow("Tab not found");
    });

    it("throws for built-in tabs", async () => {
      const { commands } = setup();
      await expect(
        commands.send(TAB_CUSTOMIZATION_OPEN, { tabId: "builtin-1" as TabId }),
      ).rejects.toThrow("Cannot customize built-in tabs");
    });

    it("throws for ephemeral tabs", async () => {
      const { commands } = setup();
      await expect(
        commands.send(TAB_CUSTOMIZATION_OPEN, { tabId: "ephemeral-1" as TabId }),
      ).rejects.toThrow("Cannot customize ephemeral tabs");
    });

    it("allows pinned but unbookmarked tabs", async () => {
      const { commands, events } = setup();
      mockIsPinned.mockImplementation((id) => id === "ephemeral-1");
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_OPENED, listener);

      await commands.send(TAB_CUSTOMIZATION_OPEN, { tabId: "ephemeral-1" as TabId });

      expect(listener).toHaveBeenCalledWith({ tabId: "ephemeral-1" });
      mockIsPinned.mockImplementation(() => false);
    });
  });

  describe("TAB_CUSTOMIZATION_CLOSE", () => {
    it("emits closed event", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CLOSED, listener);

      await commands.send(TAB_CUSTOMIZATION_CLOSE, { tabId: "tab-1" as TabId });

      expect(listener).toHaveBeenCalledWith({ tabId: "tab-1" });
    });
  });

  describe("TAB_CUSTOMIZATION_SET_TITLE", () => {
    it("sets custom title and emits changed", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "My Custom Title",
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining({
            title: "My Custom Title",
            fixedAddressDisabled: false,
          }),
        }),
      );
    });

    it("persists customization to data store", async () => {
      const { commands, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Persisted Title",
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toMatchObject({
        id: "tab-1",
        title: "Persisted Title",
        fixedAddressDisabled: false,
      });
    });

    it("clears title with null", async () => {
      const { commands, events } = setup();

      // Set title first
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      // Clear title
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: null,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining({ title: null, fixedAddressDisabled: false }),
        }),
      );
    });

    it("removes from data store when all values are default", async () => {
      const { commands, dataStore } = setup();

      // Set then clear
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: null,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toBeUndefined();
    });
  });

  describe("TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED", () => {
    it("sets flag and emits changed", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: true,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining({ title: null, fixedAddressDisabled: true }),
        }),
      );
    });

    it("persists to data store", async () => {
      const { commands, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: true,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toMatchObject({
        id: "tab-1",
        title: null,
        fixedAddressDisabled: true,
      });
    });

    it("removes from data store when reset to default", async () => {
      const { commands, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: true,
      });
      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: false,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toBeUndefined();
    });
  });

  describe("TAB_CUSTOMIZATION_SET_NAVIGATION", () => {
    const navSettings = {
      blockNavigate: { enabled: true, crossOriginOnly: true },
      blockRedirect: { enabled: true, crossOriginOnly: false },
      blockFrameNavigate: { enabled: false, crossOriginOnly: false },
      blockNewTabs: true,
      blockNewWindows: false,
    };

    it("sets navigation blocking rules and emits changed", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      await commands.send(TAB_CUSTOMIZATION_SET_NAVIGATION, {
        tabId: "tab-1" as TabId,
        ...navSettings,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining(navSettings),
        }),
      );
    });

    it("persists navigation settings to data store", async () => {
      const { commands, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_NAVIGATION, {
        tabId: "tab-1" as TabId,
        ...navSettings,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toMatchObject({
        id: "tab-1",
        ...navSettings,
      });
    });

    it("removes from data store when reset to defaults", async () => {
      const { commands, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_NAVIGATION, {
        tabId: "tab-1" as TabId,
        ...navSettings,
      });

      await commands.send(TAB_CUSTOMIZATION_SET_NAVIGATION, {
        tabId: "tab-1" as TabId,
        blockNavigate: { enabled: false, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toBeUndefined();
    });

    it("preserves navigation settings when changing title", async () => {
      const { commands } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_NAVIGATION, {
        tabId: "tab-1" as TabId,
        ...navSettings,
      });

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-1" as TabId,
      });
      expect(state).toMatchObject({ title: "Custom", ...navSettings });
    });
  });

  describe("TAB_CUSTOMIZATION_GET_STATE", () => {
    it("returns default for uncustomized tab", async () => {
      const { commands } = setup();

      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-1" as TabId,
      });

      expect(state).toMatchObject({ title: null, fixedAddressDisabled: false });
    });

    it("returns current customization", async () => {
      const { commands } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-1" as TabId,
      });

      expect(state).toMatchObject({ title: "Custom", fixedAddressDisabled: false });
    });
  });

  describe("tabs:closed cleanup", () => {
    it("removes customization when tab closes", async () => {
      const { commands, events } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      const removedListener = vi.fn();
      events.on(TAB_CUSTOMIZATION_REMOVED, removedListener);

      events.emit("tabs:closed", { tabId: "tab-1" as TabId, activatedTabId: null });

      expect(removedListener).toHaveBeenCalledWith({ tabId: "tab-1" });

      // Should be gone from state
      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-1" as TabId,
      });
      expect(state).toMatchObject({ title: null, fixedAddressDisabled: false });
    });

    it("does not emit removed for uncustomized tabs", () => {
      const { events } = setup();
      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_REMOVED, listener);

      events.emit("tabs:closed", { tabId: "tab-2" as TabId, activatedTabId: null });

      expect(listener).not.toHaveBeenCalled();
    });

    it("removes persisted data on tab close", async () => {
      const { commands, events, dataStore } = setup();

      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      events.emit("tabs:closed", { tabId: "tab-1" as TabId, activatedTabId: null });

      // Wait for async remove
      await new Promise((r) => setTimeout(r, 10));

      const collection = dataStore.collection("tab-customizations");
      const doc = await collection.findOne("tab-1");
      expect(doc).toBeUndefined();
    });
  });

  describe("start()", () => {
    it("loads persisted customizations and emits changed events", async () => {
      const { deps, dataStore, events } = setup();

      // Pre-populate data store
      const collection = dataStore.collection("tab-customizations");
      await collection.upsert({
        id: "tab-1",
        title: "Persisted Title",
        fixedAddressDisabled: true,
      });

      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      await start(deps);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining({
            title: "Persisted Title",
            fixedAddressDisabled: true,
          }),
        }),
      );
    });

    it("makes persisted customizations available via get-state", async () => {
      const { commands, deps, dataStore } = setup();

      const collection = dataStore.collection("tab-customizations");
      await collection.upsert({
        id: "tab-2",
        title: null,
        fixedAddressDisabled: true,
      });

      await start(deps);

      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-2" as TabId,
      });
      expect(state).toMatchObject({ title: null, fixedAddressDisabled: true });
    });

    it("restores persisted customizations with their original IDs", async () => {
      const { commands, deps, dataStore, events } = setup();

      const collection = dataStore.collection("tab-customizations");
      await collection.upsert({
        id: "tab-1",
        title: "Persisted",
        fixedAddressDisabled: true,
      });

      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      await start(deps);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-1",
          customization: expect.objectContaining({
            title: "Persisted",
            fixedAddressDisabled: true,
          }),
        }),
      );

      const state = await commands.send(TAB_CUSTOMIZATION_GET_STATE, {
        tabId: "tab-1" as TabId,
      });
      expect(state).toMatchObject({ title: "Persisted", fixedAddressDisabled: true });
    });
  });

  describe("combined customizations", () => {
    it("preserves other fields when setting title", async () => {
      const { commands, events } = setup();

      // Set fixed address first
      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: true,
      });

      const listener = vi.fn();
      events.on(TAB_CUSTOMIZATION_CHANGED, listener);

      // Then set title — should preserve fixedAddressDisabled
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          customization: expect.objectContaining({ title: "Custom", fixedAddressDisabled: true }),
        }),
      );
    });

    it("only removes from store when ALL values are default", async () => {
      const { commands, dataStore } = setup();

      // Set both
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: "Custom",
      });
      await commands.send(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
        tabId: "tab-1" as TabId,
        disabled: true,
      });

      // Clear title only — fixedAddressDisabled still true, should stay persisted
      await commands.send(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId: "tab-1" as TabId,
        title: null,
      });

      const collection = dataStore.collection("tab-customizations");
      const doc = (await collection.findOne("tab-1")) as
        | {
            fixedAddressDisabled: boolean;
          }
        | undefined;
      expect(doc).toBeDefined();
      expect(doc?.fixedAddressDisabled).toBe(true);
    });
  });
});

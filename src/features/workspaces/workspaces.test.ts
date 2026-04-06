import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";

// Mock tabs.main for cross-feature dependency
vi.mock("../tabs/tabs.main", () => ({
  getTabsForWorkspace: vi.fn(() => []),
}));

import { getTabsForWorkspace } from "../tabs/tabs.main";
import {
  TABS_ACTIVATE,
  TABS_ACTIVATED,
  TABS_NAVIGATE,
  TABS_SET_WORKSPACE,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import feature from "./workspaces.main";
import {
  WORKSPACES_CREATE,
  WORKSPACES_CREATED,
  WORKSPACES_DELETE,
  WORKSPACES_DELETED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_MOVE_TAB,
  WORKSPACES_RESTORE_TAB,
  WORKSPACES_SWITCH,
  WORKSPACES_SWITCHED,
  WORKSPACES_UPDATE,
  WORKSPACES_UPDATED,
} from "./workspaces.shared";

const WIN_ID = "win-1" as WindowId;

type AllCommands = Parameters<typeof feature.register>[0] extends { commands: CommandBus<infer C> }
  ? C
  : never;
type AllEvents = Parameters<typeof feature.register>[0] extends { events: EventBus<infer E> }
  ? E
  : never;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();
  const dataStore = new MemoryDataStore();
  let activeTabId: TabId | undefined;
  let activeWsId: WorkspaceId | undefined;

  // Register dummy tab handlers so workspace cross-feature calls work
  commands.handle(TABS_ACTIVATE, async () => {});
  commands.handle(TABS_NAVIGATE, async () => {});
  commands.handle(TABS_SET_WORKSPACE, async () => {});

  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId: () => WIN_ID as WindowId | undefined,
    getActiveTabId: () => activeTabId,
    setActiveTabId: (id: TabId | undefined) => {
      activeTabId = id;
    },
    getActiveWorkspaceId: () => activeWsId,
    setActiveWorkspaceId: (id: WorkspaceId) => {
      activeWsId = id;
    },
    getTabsForWorkspace: (wsId: WorkspaceId) => getTabsForWorkspace(wsId),
  };
  feature.register(deps);
  return {
    commands,
    events,
    platform,
    dataStore,
    deps,
    setActiveTabId: (id: TabId | undefined) => {
      activeTabId = id;
    },
    setActiveWsId: (id: WorkspaceId | undefined) => {
      activeWsId = id;
    },
  };
}

describe("workspaces commands", () => {
  beforeEach(() => {
    (getTabsForWorkspace as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  describe("WORKSPACES_CREATE", () => {
    it("generates ID, emits CREATED + LIST_CHANGED", async () => {
      const { commands, events } = setup();
      const created = vi.fn();
      const listChanged = vi.fn();
      events.on(WORKSPACES_CREATED, created);
      events.on(WORKSPACES_LIST_CHANGED, listChanged);

      const id = await commands.send(WORKSPACES_CREATE, {
        name: "Personal",
        color: "blue",
        icon: "P",
      });

      expect(id).toBeDefined();
      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ name: "Personal" }),
        }),
      );
      expect(listChanged).toHaveBeenCalled();
    });
  });

  describe("WORKSPACES_SWITCH", () => {
    it("hides all tabs, emits SWITCHED", async () => {
      vi.useFakeTimers();
      const { commands, events, platform, setActiveWsId } = setup();
      const ws1Id = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });
      const ws2Id = await commands.send(WORKSPACES_CREATE, {
        name: "Personal",
        color: "red",
        icon: "P",
      });
      setActiveWsId(ws1Id);

      const switched = vi.fn();
      events.on(WORKSPACES_SWITCHED, switched);

      await commands.send(WORKSPACES_SWITCH, { workspaceId: ws2Id });

      // hideAllTabs is deferred for empty workspaces to let the renderer
      // update the background before the WebContentsView is removed
      vi.runAllTimers();
      expect(platform.hideAllTabs).toHaveBeenCalled();
      expect(switched).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: ws2Id,
          previousWorkspaceId: ws1Id,
          workspaceName: "Personal",
        }),
      );
      vi.useRealTimers();
    });

    it("no-ops when switching to same workspace", async () => {
      const { commands, events, setActiveWsId } = setup();
      const wsId = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });
      setActiveWsId(wsId);

      const switched = vi.fn();
      events.on(WORKSPACES_SWITCHED, switched);

      await commands.send(WORKSPACES_SWITCH, { workspaceId: wsId });

      expect(switched).not.toHaveBeenCalled();
    });
  });

  describe("WORKSPACES_UPDATE", () => {
    it("updates fields, emits UPDATED + LIST_CHANGED", async () => {
      const { commands, events } = setup();
      const wsId = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });

      const updated = vi.fn();
      events.on(WORKSPACES_UPDATED, updated);

      await commands.send(WORKSPACES_UPDATE, {
        workspaceId: wsId,
        changes: { name: "Office" },
      });

      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ name: "Office", color: "blue" }),
        }),
      );
    });
  });

  describe("WORKSPACES_DELETE", () => {
    it("prevents deletion of last workspace", async () => {
      const { commands, events } = setup();
      const wsId = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });

      const deleted = vi.fn();
      events.on(WORKSPACES_DELETED, deleted);

      await commands.send(WORKSPACES_DELETE, { workspaceId: wsId });

      expect(deleted).not.toHaveBeenCalled();
    });

    it("deletes workspace, moves tabs to default, emits DELETED", async () => {
      const { commands, events, setActiveWsId } = setup();
      const ws1Id = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });
      const ws2Id = await commands.send(WORKSPACES_CREATE, {
        name: "Personal",
        color: "red",
        icon: "P",
      });
      setActiveWsId(ws2Id);

      const mockTab = {
        id: "t1" as TabId,
        workspaceId: ws2Id,
        url: "https://example.com",
        title: "Ex",
        favicon: "",
        loading: false,
        bookmarked: false,
        lastAccessedAt: 0,
        createdAt: 0,
        order: 0,
      };
      (getTabsForWorkspace as ReturnType<typeof vi.fn>).mockReturnValue([mockTab]);

      const deleted = vi.fn();
      events.on(WORKSPACES_DELETED, deleted);

      await commands.send(WORKSPACES_DELETE, { workspaceId: ws2Id });

      expect(deleted).toHaveBeenCalledWith({ workspaceId: ws2Id });
    });
  });

  describe("WORKSPACES_MOVE_TAB", () => {
    it("moves active tab to target workspace", async () => {
      const { commands, events, setActiveTabId, setActiveWsId } = setup();
      const ws1Id = await commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });
      const ws2Id = await commands.send(WORKSPACES_CREATE, {
        name: "Personal",
        color: "red",
        icon: "P",
      });
      setActiveWsId(ws1Id);

      const mockTab = {
        id: "t1" as TabId,
        workspaceId: ws1Id,
        url: "https://example.com",
        title: "Ex",
        favicon: "",
        loading: false,
        bookmarked: false,
        lastAccessedAt: 0,
        createdAt: 0,
        order: 0,
      };
      (getTabsForWorkspace as ReturnType<typeof vi.fn>).mockReturnValue([mockTab]);
      setActiveTabId("t1" as TabId);

      await commands.send(WORKSPACES_MOVE_TAB, { targetWorkspaceId: ws2Id });
    });
  });
});

describe("start()", () => {
  it("restores persisted workspaces", async () => {
    const dataStore = new MemoryDataStore();
    const wsColl = dataStore.collection("workspaces");
    await wsColl.insert({ id: "ws-1", name: "Work", color: "blue", icon: "W", order: 0 });
    await wsColl.insert({ id: "ws-2", name: "Personal", color: "red", icon: "P", order: 1 });

    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform();
    let activeWsId: WorkspaceId | undefined;
    commands.handle(TABS_ACTIVATE, async () => {});
    commands.handle(TABS_NAVIGATE, async () => {});

    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => undefined as TabId | undefined,
      setActiveTabId: () => {},
      getActiveWorkspaceId: () => activeWsId,
      setActiveWorkspaceId: (id: WorkspaceId) => {
        activeWsId = id;
      },
      getTabsForWorkspace: (wsId: WorkspaceId) => getTabsForWorkspace(wsId),
    };
    feature.register(deps);

    const listChanged = vi.fn();
    events.on(WORKSPACES_LIST_CHANGED, listChanged);

    await feature.start?.(deps);

    expect(activeWsId).toBe("ws-1" as WorkspaceId);
    expect(listChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: expect.arrayContaining([
          expect.objectContaining({ name: "Work" }),
          expect.objectContaining({ name: "Personal" }),
        ]),
      }),
    );
  });

  it("creates default workspace when empty", async () => {
    const dataStore = new MemoryDataStore();
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform();
    let activeWsId: WorkspaceId | undefined;
    commands.handle(TABS_ACTIVATE, async () => {});
    commands.handle(TABS_NAVIGATE, async () => {});

    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => undefined as TabId | undefined,
      setActiveTabId: () => {},
      getActiveWorkspaceId: () => activeWsId,
      setActiveWorkspaceId: (id: WorkspaceId) => {
        activeWsId = id;
      },
      getTabsForWorkspace: (wsId: WorkspaceId) => getTabsForWorkspace(wsId),
    };
    feature.register(deps);

    const created = vi.fn();
    events.on(WORKSPACES_CREATED, created);

    await feature.start?.(deps);

    expect(activeWsId).toBeDefined();
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: expect.objectContaining({ name: "Work" }),
      }),
    );
  });
});

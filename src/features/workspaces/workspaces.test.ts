import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { createMockPlatform, makeTab } from "../../test-utils";

// Mock tabs.main for cross-feature dependency
vi.mock("../tabs/tabs.main", () => ({
  getTabsForWorkspace: vi.fn(() => []),
}));

// Mock pinned-tabs.main
vi.mock("../pinned-tabs/pinned-tabs.main", () => ({
  isPinned: vi.fn(() => false),
}));

import { isPinned } from "../pinned-tabs/pinned-tabs.main";
import { getTabsForWorkspace } from "../tabs/tabs.main";
import {
  TABS_ACTIVATE,
  TABS_ACTIVATED,
  TABS_NAVIGATE,
  TABS_SET_WORKSPACE,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import feature, { getWorkspace } from "./workspaces.main";
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

function setup(platformOverrides = {}) {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform(platformOverrides);
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

    it("keeps pinned tab active when switching workspaces", async () => {
      vi.useFakeTimers();
      const { commands, events, platform, setActiveTabId, setActiveWsId } = setup();
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
      setActiveTabId("pinned-t1" as TabId);
      (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const activated = vi.fn();
      events.on(TABS_ACTIVATED, activated);

      await commands.send(WORKSPACES_SWITCH, { workspaceId: ws2Id });
      vi.runAllTimers();

      // Should NOT hide tabs or deactivate — the pinned tab stays visible
      expect(platform.hideAllTabs).not.toHaveBeenCalled();
      expect(activated).not.toHaveBeenCalled();

      (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(false);
      vi.useRealTimers();
    });

    it("remembers last non-pinned tab when pinned tab is active during switch", async () => {
      vi.useFakeTimers();
      const { commands, events, platform, setActiveTabId, setActiveWsId } = setup();
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

      // Activate a non-pinned tab — TABS_ACTIVATED listener saves it to ws1
      const tabY = "tab-y" as TabId;
      events.emit(TABS_ACTIVATED, { tabId: tabY, previousTabId: null });
      setActiveTabId(tabY);

      // Now switch to a pinned tab
      const pinnedTab = "pinned-t1" as TabId;
      (isPinned as ReturnType<typeof vi.fn>).mockImplementation((id: TabId) => id === pinnedTab);
      events.emit(TABS_ACTIVATED, { tabId: pinnedTab, previousTabId: tabY });
      setActiveTabId(pinnedTab);

      // Switch to ws2 while pinned tab is active
      await commands.send(WORKSPACES_SWITCH, { workspaceId: ws2Id });
      vi.runAllTimers();

      // Switch back to ws1 — should restore tabY (the last non-pinned tab), not the pinned tab
      // Spy on TABS_ACTIVATE calls to see which tab gets activated
      const activateCalls: unknown[] = [];
      const origSend = commands.send.bind(commands);
      vi.spyOn(commands, "send").mockImplementation(async (name: string, payload: unknown) => {
        if (name === TABS_ACTIVATE) activateCalls.push(payload);
        return origSend(name, payload);
      });

      (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(false);
      setActiveTabId(undefined);
      await commands.send(WORKSPACES_SWITCH, { workspaceId: ws1Id });

      expect(activateCalls).toContainEqual({ tabId: tabY });

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
    it.each([true, false])(
      "moves the %s active tab and follows it, preserving source selection",
      async (moveActive) => {
        const { commands, events, deps, platform, setActiveTabId, setActiveWsId } = setup();
        const source = await commands.send(WORKSPACES_CREATE, {
          name: "Work",
          color: "blue",
          icon: "W",
        });
        const target = await commands.send(WORKSPACES_CREATE, {
          name: "Personal",
          color: "red",
          icon: "P",
        });
        const moved = makeTab({ id: "moved" as TabId, workspaceId: source, bookmarked: false });
        const remaining = makeTab({ id: "remaining" as TabId, workspaceId: source });
        const tabs = [moved, remaining];
        vi.mocked(getTabsForWorkspace).mockImplementation((id) =>
          tabs.filter((tab) => tab.workspaceId === id),
        );
        setActiveWsId(source);
        const active = moveActive ? moved.id : remaining.id;
        setActiveTabId(active);
        events.emit(TABS_ACTIVATED, { tabId: active, previousTabId: null });
        getWorkspace(target)!.activeTabId = "old-target" as TabId;
        commands.unhandle(TABS_SET_WORKSPACE);
        commands.handle(TABS_SET_WORKSPACE, async ({ tabId, workspaceId }) => {
          tabs.find((tab) => tab.id === tabId)!.workspaceId = workspaceId;
        });
        commands.unhandle(TABS_ACTIVATE);
        commands.handle(TABS_ACTIVATE, async ({ tabId }) => {
          const previousTabId = deps.getActiveTabId() ?? null;
          setActiveTabId(tabId);
          events.emit(TABS_ACTIVATED, { tabId, previousTabId });
        });
        const switched = vi.fn();
        events.on(WORKSPACES_SWITCHED, switched);
        const before = { ...moved };
        await commands.send(WORKSPACES_MOVE_TAB, {
          targetWorkspaceId: target,
          ...(moveActive ? {} : { tabId: moved.id }),
        });
        expect(moved).toEqual({ ...before, workspaceId: target });
        expect(tabs).toHaveLength(2);
        expect(deps.getActiveWorkspaceId()).toBe(target);
        expect(deps.getActiveTabId()).toBe(moved.id);
        expect(switched).toHaveBeenCalledWith({
          workspaceId: target,
          previousWorkspaceId: source,
          workspaceName: "Personal",
        });
        expect(platform.closeTab).not.toHaveBeenCalled();
        await commands.send(WORKSPACES_SWITCH, { workspaceId: source });
        expect(deps.getActiveTabId()).toBe(remaining.id);
      },
    );

    it.each(["missing-tab", "missing-workspace", "same-workspace", "pinned"])(
      "ignores %s moves",
      async (kind) => {
        const { commands, deps, setActiveTabId, setActiveWsId } = setup();
        const source = await commands.send(WORKSPACES_CREATE, {
          name: "Work",
          color: "blue",
          icon: "W",
        });
        const target = await commands.send(WORKSPACES_CREATE, {
          name: "Personal",
          color: "red",
          icon: "P",
        });
        const tab = makeTab({ workspaceId: source });
        vi.mocked(getTabsForWorkspace).mockReturnValue([tab]);
        vi.mocked(isPinned).mockReturnValue(kind === "pinned");
        setActiveWsId(source);
        setActiveTabId(tab.id);
        const setWorkspace = vi.fn();
        commands.unhandle(TABS_SET_WORKSPACE);
        commands.handle(TABS_SET_WORKSPACE, setWorkspace);
        await commands.send(WORKSPACES_MOVE_TAB, {
          tabId: kind === "missing-tab" ? ("missing" as TabId) : tab.id,
          targetWorkspaceId:
            kind === "missing-workspace"
              ? ("missing" as WorkspaceId)
              : kind === "same-workspace"
                ? source
                : target,
        });
        expect(setWorkspace).not.toHaveBeenCalled();
        expect(deps.getActiveWorkspaceId()).toBe(source);
        vi.mocked(isPinned).mockReturnValue(false);
      },
    );
  });
});

describe("cancelled quit", () => {
  type QuitCancelled = Parameters<ReturnType<typeof createMockPlatform>["onQuitCancelled"]>[0];

  it.each([
    ["in another workspace", "other", "none", "other"],
    ["in another workspace while a pinned tab is shown", "other", "pinned-active", "other"],
    ["in this workspace", "this", "none", "this"],
    ["pinned", "other", "stayed", "this"],
  ] as const)("shows a page the user stayed on %s", async (_, where, pinned, workspaceAfter) => {
    let cancelQuit: QuitCancelled = () => {};
    const ctx = setup({
      onQuitCancelled: vi.fn((callback: QuitCancelled) => {
        cancelQuit = callback;
        return () => {};
      }),
    });
    const here = await ctx.commands.send(WORKSPACES_CREATE, {
      name: "Work",
      color: "blue",
      icon: "W",
    });
    const other = await ctx.commands.send(WORKSPACES_CREATE, {
      name: "Personal",
      color: "red",
      icon: "P",
    });
    const stayed = makeTab({
      id: "stayed" as TabId,
      workspaceId: where === "other" ? other : here,
    });
    const pinnedTab = "pinned" as TabId;
    vi.mocked(getTabsForWorkspace).mockImplementation((id) =>
      id === stayed.workspaceId ? [stayed] : [],
    );
    vi.mocked(isPinned).mockImplementation((id) =>
      pinned === "stayed" ? id === stayed.id : pinned === "pinned-active" && id === pinnedTab,
    );
    ctx.setActiveWsId(here);
    ctx.setActiveTabId(pinned === "pinned-active" ? pinnedTab : undefined);
    ctx.commands.unhandle(TABS_ACTIVATE);
    ctx.commands.handle(TABS_ACTIVATE, async ({ tabId }) => {
      ctx.setActiveTabId(tabId);
    });

    cancelQuit({ unloadedTabIds: [], stayedTabId: stayed.id });

    const switches = workspaceAfter === "other";
    await vi.waitFor(() => {
      expect(ctx.deps.getActiveWorkspaceId()).toBe(switches ? other : here);
      if (switches) expect(ctx.deps.getActiveTabId()).toBe(stayed.id);
    });
    // The tabs feature shows a stayed page in this workspace or a pinned one.
    if (!switches) expect(ctx.deps.getActiveTabId()).not.toBe(stayed.id);
    vi.mocked(isPinned).mockReset();
    vi.mocked(isPinned).mockReturnValue(false);
  });
});

// #140: quitting shows a page with unsaved changes before asking about it.
describe("showing a page before asking about it when quitting", () => {
  type ShowPage = Parameters<ReturnType<typeof createMockPlatform>["onShowPageBeforeAsking"]>[0];

  it.each([
    ["in another workspace", "other", "none", "other"],
    ["in another workspace while a pinned tab is shown", "other", "pinned-active", "other"],
    ["in this workspace", "this", "none", "this"],
    ["pinned", "other", "asked", "this"],
  ] as const)("shows a page %s", async (_, where, pinned, workspaceAfter) => {
    let showPage: ShowPage = () => {};
    const ctx = setup({
      onShowPageBeforeAsking: vi.fn((callback: ShowPage) => {
        showPage = callback;
        return () => {};
      }),
    });
    const here = await ctx.commands.send(WORKSPACES_CREATE, {
      name: "Work",
      color: "blue",
      icon: "W",
    });
    const other = await ctx.commands.send(WORKSPACES_CREATE, {
      name: "Personal",
      color: "red",
      icon: "P",
    });
    const asked = makeTab({ id: "asked" as TabId, workspaceId: where === "other" ? other : here });
    const pinnedTab = "pinned" as TabId;
    vi.mocked(getTabsForWorkspace).mockImplementation((id) =>
      id === asked.workspaceId ? [asked] : [],
    );
    vi.mocked(isPinned).mockImplementation((id) =>
      pinned === "asked" ? id === asked.id : pinned === "pinned-active" && id === pinnedTab,
    );
    ctx.setActiveWsId(here);
    ctx.setActiveTabId(pinned === "pinned-active" ? pinnedTab : undefined);
    ctx.commands.unhandle(TABS_ACTIVATE);
    ctx.commands.handle(TABS_ACTIVATE, async ({ tabId }) => {
      ctx.setActiveTabId(tabId);
    });

    // The prompt waits for the page to be shown.
    await showPage(asked.id);

    expect(ctx.deps.getActiveWorkspaceId()).toBe(workspaceAfter === "other" ? other : here);
    expect(ctx.deps.getActiveTabId()).toBe(asked.id);
    vi.mocked(isPinned).mockReset();
    vi.mocked(isPinned).mockReturnValue(false);
  });

  // #150: after asking about a tab the user closed, go back to the page they were on.
  describe("going back after asking", () => {
    afterEach(() => {
      vi.mocked(isPinned).mockImplementation(() => false);
    });

    async function setupGoingBack(where: "this" | "other") {
      let showPage: ShowPage = () => {};
      const ctx = setup({
        onShowPageBeforeAsking: vi.fn((callback: ShowPage) => {
          showPage = callback;
          return () => {};
        }),
      });
      const here = await ctx.commands.send(WORKSPACES_CREATE, {
        name: "Work",
        color: "blue",
        icon: "W",
      });
      const other = await ctx.commands.send(WORKSPACES_CREATE, {
        name: "Personal",
        color: "red",
        icon: "P",
      });
      const current = makeTab({ id: "current" as TabId, workspaceId: here });
      const remembered = makeTab({ id: "remembered" as TabId, workspaceId: other });
      const asked = makeTab({
        id: "asked" as TabId,
        workspaceId: where === "other" ? other : here,
      });
      vi.mocked(getTabsForWorkspace).mockImplementation((id) =>
        [current, remembered, asked].filter((tab) => tab.workspaceId === id),
      );
      ctx.commands.unhandle(TABS_ACTIVATE);
      ctx.commands.handle(TABS_ACTIVATE, async ({ tabId }) => {
        const previousTabId = ctx.deps.getActiveTabId() ?? null;
        ctx.setActiveTabId(tabId);
        ctx.events.emit(TABS_ACTIVATED, { tabId, previousTabId });
      });
      // The other workspace was last left on another tab.
      await ctx.commands.send(WORKSPACES_SWITCH, { workspaceId: other });
      await ctx.commands.send(TABS_ACTIVATE, { tabId: remembered.id });
      await ctx.commands.send(WORKSPACES_SWITCH, { workspaceId: here });
      await ctx.commands.send(TABS_ACTIVATE, { tabId: current.id });
      return {
        ...ctx,
        here,
        other,
        current,
        remembered,
        asked,
        showPage: () => showPage(asked.id),
      };
    }

    it.each(["this", "other"] as const)("goes back from a page in %s workspace", async (where) => {
      const ctx = await setupGoingBack(where);
      const goBack = await ctx.showPage();
      expect(ctx.deps.getActiveTabId()).toBe(ctx.asked.id);

      await goBack?.();

      expect(ctx.deps.getActiveWorkspaceId()).toBe(ctx.here);
      expect(ctx.deps.getActiveTabId()).toBe(ctx.current.id);
      // The other workspace still opens on the tab it was left on.
      await ctx.commands.send(WORKSPACES_SWITCH, { workspaceId: ctx.other });
      expect(ctx.deps.getActiveTabId()).toBe(ctx.remembered.id);
    });

    it("goes back to a pinned tab, and the workspace still remembers its own tab", async () => {
      const ctx = await setupGoingBack("this");
      const pinned = "pinned" as TabId;
      vi.mocked(isPinned).mockImplementation((id) => id === pinned);
      await ctx.commands.send(TABS_ACTIVATE, { tabId: pinned });
      const goBack = await ctx.showPage();
      expect(ctx.deps.getActiveTabId()).toBe(ctx.asked.id);

      await goBack?.();

      expect(ctx.deps.getActiveTabId()).toBe(pinned);
      expect(getWorkspace(ctx.here)?.activeTabId).toBe(ctx.current.id);
    });

    it("stays on the page when the one the user was on closed meanwhile", async () => {
      const ctx = await setupGoingBack("other");
      const goBack = await ctx.showPage();
      vi.mocked(getTabsForWorkspace).mockImplementation((id) =>
        [ctx.remembered, ctx.asked].filter((tab) => tab.workspaceId === id),
      );

      await goBack?.();

      expect(ctx.deps.getActiveWorkspaceId()).toBe(ctx.other);
      expect(ctx.deps.getActiveTabId()).toBe(ctx.asked.id);
    });

    it("stays in the workspace the user switched to while a pinned page was shown", async () => {
      const ctx = await setupGoingBack("this");
      vi.mocked(isPinned).mockImplementation((id) => id === ctx.asked.id);
      const goBack = await ctx.showPage();
      expect(ctx.deps.getActiveTabId()).toBe(ctx.asked.id);
      // The pinned page stays shown in the other workspace.
      await ctx.commands.send(WORKSPACES_SWITCH, { workspaceId: ctx.other });

      await goBack?.();

      expect(ctx.deps.getActiveWorkspaceId()).toBe(ctx.other);
      expect(ctx.deps.getActiveTabId()).toBe(ctx.asked.id);
    });

    it("stays where the user went while the page was shown", async () => {
      const ctx = await setupGoingBack("this");
      const goBack = await ctx.showPage();
      const elsewhere = "elsewhere" as TabId;
      await ctx.commands.send(TABS_ACTIVATE, { tabId: elsewhere });

      await goBack?.();

      expect(ctx.deps.getActiveTabId()).toBe(elsewhere);
    });
  });

  it("leaves sub-tabs to the sub-tabs feature", async () => {
    let showPage: ShowPage = () => {};
    const ctx = setup({
      onShowPageBeforeAsking: vi.fn((callback: ShowPage) => {
        showPage = callback;
        return () => {};
      }),
    });
    vi.mocked(getTabsForWorkspace).mockReturnValue([]);
    const activate = vi.fn(async () => {});
    ctx.commands.unhandle(TABS_ACTIVATE);
    ctx.commands.handle(TABS_ACTIVATE, activate);
    await showPage("sub-tab" as TabId);
    expect(activate).not.toHaveBeenCalled();
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

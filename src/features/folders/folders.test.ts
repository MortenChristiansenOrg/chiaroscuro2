import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { FolderId, TabId, WorkspaceId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import type { Tab } from "../tabs/tabs.shared";
import { TABS_LIST_CHANGED, TABS_UPDATED } from "../tabs/tabs.shared";
import feature, { start } from "./folders.main";
import {
  FOLDERS_CHANGED,
  FOLDERS_CREATE,
  FOLDERS_GET_FOR_LEVEL,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_RENAME_REQUESTED,
  FOLDERS_REORDER,
  FOLDERS_SET_ORDER,
  FOLDERS_TOGGLE,
  FOLDERS_TOGGLE_COLLAPSE,
} from "./folders.shared";

const WS_ID = "ws-1" as WorkspaceId;
const WS2_ID = "ws-2" as WorkspaceId;

type AllCommands = Parameters<typeof feature.register>[0] extends { commands: CommandBus<infer C> }
  ? C
  : never;
type AllEvents = Parameters<typeof feature.register>[0] extends { events: EventBus<infer E> }
  ? E
  : never;

function setup(opts?: { tabs?: Tab[] }) {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const tabs = new Map<TabId, Tab>();
  let activeTabId: TabId | undefined;

  for (const t of opts?.tabs ?? []) {
    tabs.set(t.id, { ...t });
  }

  const deps = {
    commands,
    events,
    dataStore,
    getActiveTabId: () => activeTabId,
    getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
    getTab: (id: TabId) => tabs.get(id),
    getTabsForWorkspace: (wsId: WorkspaceId) =>
      [...tabs.values()].filter((t) => t.workspaceId === wsId),
    setTabFolderId: (tabId: TabId, folderId: FolderId | null) => {
      const tab = tabs.get(tabId);
      if (tab) tab.folderId = folderId;
    },
    setTabOrder: (tabId: TabId, order: number) => {
      const tab = tabs.get(tabId);
      if (tab) tab.order = order;
    },
  };

  feature.register(deps);

  return {
    commands,
    events,
    dataStore,
    deps,
    tabs,
    setActiveTabId: (id: TabId | undefined) => {
      activeTabId = id;
    },
  };
}

describe("FOLDERS_CREATE", () => {
  it("creates folder at root level, emits CHANGED + RENAME_REQUESTED", async () => {
    const { commands, events } = setup();
    const changed = vi.fn();
    const renameReq = vi.fn();
    events.on(FOLDERS_CHANGED, changed);
    events.on(FOLDERS_RENAME_REQUESTED, renameReq);

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    expect(changed).toHaveBeenCalledTimes(1);
    const folders = changed.mock.calls[0]?.[0].folders;
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({
      workspaceId: WS_ID,
      name: "New Folder",
      parentFolderId: null,
      collapsed: false,
      order: 0,
    });
    expect(renameReq).toHaveBeenCalledWith({ folderId: folders[0].id });
  });

  it("creates nested folder inside parent", async () => {
    const { commands, events } = setup();
    // Create parent
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    const parentFolders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const parentId = parentFolders[0]?.id;

    await commands.send(FOLDERS_CREATE, { parentFolderId: parentId, workspaceId: WS_ID });

    const allFolders = changed.mock.calls.at(-1)?.[0].folders;
    const child = allFolders.find(
      (f: { parentFolderId: FolderId | null }) => f.parentFolderId === parentId,
    );
    expect(child).toBeDefined();
    expect(child.parentFolderId).toBe(parentId);
  });

  it("assigns incrementing order among siblings", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(folders).toHaveLength(2);
    expect(folders[0]?.order).toBe(0);
    expect(folders[1]?.order).toBe(1);
  });
});

describe("FOLDERS_RENAME", () => {
  it("renames folder, emits CHANGED", async () => {
    const { commands, events } = setup();
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_RENAME, { folderId, name: "My Folder" });

    const updated = changed.mock.calls[0]?.[0].folders.find(
      (f: { id: FolderId }) => f.id === folderId,
    );
    expect(updated.name).toBe("My Folder");
  });

  it("no-ops for nonexistent folder", async () => {
    const { commands, events } = setup();
    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_RENAME, { folderId: "nope" as FolderId, name: "x" });
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("FOLDERS_TOGGLE_COLLAPSE", () => {
  it("toggles collapsed state", async () => {
    const { commands } = setup();
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;
    expect(folders[0]?.collapsed).toBe(false);

    await commands.send(FOLDERS_TOGGLE_COLLAPSE, { folderId });
    const after = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(after[0]?.collapsed).toBe(true);

    await commands.send(FOLDERS_TOGGLE_COLLAPSE, { folderId });
    const after2 = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(after2[0]?.collapsed).toBe(false);
  });
});

describe("FOLDERS_TOGGLE", () => {
  it("creates new folder containing the tab", async () => {
    const tab = makeTab({ id: "t1" as TabId, workspaceId: WS_ID, bookmarked: true, order: 0 });
    const { commands, events, setActiveTabId } = setup({ tabs: [tab] });
    setActiveTabId("t1" as TabId);

    const changed = vi.fn();
    const renameReq = vi.fn();
    events.on(FOLDERS_CHANGED, changed);
    events.on(FOLDERS_RENAME_REQUESTED, renameReq);

    await commands.send(FOLDERS_TOGGLE, {});

    expect(changed).toHaveBeenCalled();
    expect(renameReq).toHaveBeenCalled();
    const folders = changed.mock.calls.at(-1)?.[0].folders;
    expect(folders).toHaveLength(1);
  });

  it("removes tab from folder when already in one", async () => {
    const folderId = "f1" as FolderId;
    const tab = makeTab({
      id: "t1" as TabId,
      workspaceId: WS_ID,
      bookmarked: true,
      folderId,
      order: 0,
    });
    const { commands, events, setActiveTabId, tabs } = setup({ tabs: [tab] });
    setActiveTabId("t1" as TabId);

    // Manually create the folder first
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });

    // Update tab to be in the created folder
    const realFolderId = folders[0]?.id;
    const t1 = tabs.get("t1" as TabId);
    if (t1) t1.folderId = realFolderId;

    const tabUpdated = vi.fn();
    events.on(TABS_UPDATED, tabUpdated);

    await commands.send(FOLDERS_TOGGLE, { tabId: "t1" });

    // Tab should be removed from folder
    expect(tabs.get("t1" as TabId)?.folderId).toBeNull();
    expect(tabUpdated).toHaveBeenCalled();
  });

  it("no-ops for nonexistent/non-bookmarked tabs", async () => {
    const tab = makeTab({
      id: "t1" as TabId,
      workspaceId: WS_ID,
      bookmarked: false,
      order: 0,
    });
    const { commands, events, setActiveTabId } = setup({ tabs: [tab] });
    setActiveTabId("t1" as TabId);

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_TOGGLE, {});
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("FOLDERS_REMOVE", () => {
  it("removes folder and promotes contained tabs to parent level", async () => {
    const tab = makeTab({
      id: "t1" as TabId,
      workspaceId: WS_ID,
      bookmarked: true,
      order: 0,
    });
    const { commands, events, tabs } = setup({ tabs: [tab] });

    // Create folder and put tab in it
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;
    const t1ref = tabs.get("t1" as TabId);
    if (t1ref) t1ref.folderId = folderId;

    const listChanged = vi.fn();
    events.on(TABS_LIST_CHANGED, listChanged);

    await commands.send(FOLDERS_REMOVE, { folderId });

    // Folder should be gone
    const remaining = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(remaining).toHaveLength(0);

    // Tab should be moved to root (null folderId)
    expect(tabs.get("t1" as TabId)?.folderId).toBeNull();
    expect(listChanged).toHaveBeenCalled();
  });

  it("promotes child folders to parent level", async () => {
    const { commands } = setup();

    // Create parent + child
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const parents = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const parentId = parents[0]?.id;

    await commands.send(FOLDERS_CREATE, { parentFolderId: parentId, workspaceId: WS_ID });
    const children = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: parentId,
    });
    expect(children).toHaveLength(1);
    const childId = children[0]?.id;

    // Remove parent
    await commands.send(FOLDERS_REMOVE, { folderId: parentId });

    // Child should now be at root
    const rootFolders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(rootFolders.some((f) => f.id === childId)).toBe(true);
    expect(rootFolders.find((f) => f.id === childId)?.parentFolderId).toBeNull();
  });
});

describe("FOLDERS_REORDER", () => {
  it("reorders folder before target folder", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    // 3 folders at orders 0,1,2
    const [f0, f1, f2] = folders.sort((a, b) => a.order - b.order);

    // Move f2 before f0
    await commands.send(FOLDERS_REORDER, {
      folderId: f2?.id,
      targetFolderId: f0?.id,
      position: "before",
    });

    const updated = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const sorted = updated.sort((a, b) => a.order - b.order);
    expect(sorted[0]?.id).toBe(f2?.id);
    expect(sorted[1]?.id).toBe(f0?.id);
    expect(sorted[2]?.id).toBe(f1?.id);
  });

  it("reorders folder after target folder", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const [f0, f1] = folders.sort((a, b) => a.order - b.order);

    // Move f0 after f1
    await commands.send(FOLDERS_REORDER, {
      folderId: f0?.id,
      targetFolderId: f1?.id,
      position: "after",
    });

    const updated = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const sorted = updated.sort((a, b) => a.order - b.order);
    expect(sorted[0]?.id).toBe(f1?.id);
    expect(sorted[1]?.id).toBe(f0?.id);
  });

  it("nests folder into another via parentFolderId", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const [f0, f1] = folders.sort((a, b) => a.order - b.order);

    // Nest f1 inside f0
    await commands.send(FOLDERS_REORDER, {
      folderId: f1?.id,
      parentFolderId: f0?.id,
    });

    // f0 should be the only root folder
    const root = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(root).toHaveLength(1);
    expect(root[0]?.id).toBe(f0?.id);

    // f1 should be nested in f0
    const nested = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: f0?.id,
    });
    expect(nested).toHaveLength(1);
    expect(nested[0]?.id).toBe(f1?.id);
  });

  it("prevents circular nesting", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const [f0, f1] = folders.sort((a, b) => a.order - b.order);

    // Nest f1 inside f0
    await commands.send(FOLDERS_REORDER, { folderId: f1?.id, parentFolderId: f0?.id });

    // Try to nest f0 inside f1 (circular)
    await commands.send(FOLDERS_REORDER, { folderId: f0?.id, parentFolderId: f1?.id });

    // f0 should still be at root
    const root = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(root.some((f) => f.id === f0?.id)).toBe(true);
  });

  it("prevents self-nesting", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const f0 = folders[0];
    expect(f0).toBeDefined();

    await commands.send(FOLDERS_REORDER, { folderId: f0.id, parentFolderId: f0.id });

    // Should still be at root
    const root = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(root).toHaveLength(1);
    expect(root[0]?.parentFolderId).toBeNull();
  });

  it("reorders folder relative to a tab", async () => {
    const tab = makeTab({
      id: "t1" as TabId,
      workspaceId: WS_ID,
      bookmarked: true,
      order: 0,
      folderId: null,
    });
    const { commands } = setup({ tabs: [tab] });

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;

    // Move folder before the tab
    await commands.send(FOLDERS_REORDER, {
      folderId,
      targetTabId: "t1",
      position: "before",
    });

    const updated = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    // Folder should have a lower order than the tab
    expect(updated[0]?.order).toBeLessThanOrEqual(tab.order);
  });

  it("no-ops for nonexistent folder", async () => {
    const { commands, events } = setup();
    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_REORDER, { folderId: "nope" as FolderId });
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("FOLDERS_SET_ORDER", () => {
  it("updates folder order", async () => {
    const { commands, events } = setup();
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_SET_ORDER, { folderId, order: 5 });

    const updated = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(updated[0]?.order).toBe(5);
    expect(changed).toHaveBeenCalled();
  });

  it("no-ops when order unchanged", async () => {
    const { commands, events } = setup();
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const folders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = folders[0]?.id;
    const currentOrder = folders[0]?.order;

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await commands.send(FOLDERS_SET_ORDER, { folderId, order: currentOrder });
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("FOLDERS_GET_FOR_LEVEL", () => {
  it("returns only folders at specified level and workspace", async () => {
    const { commands } = setup();

    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const rootFolders = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(rootFolders).toHaveLength(2);

    const parentId = rootFolders[0]?.id;
    await commands.send(FOLDERS_CREATE, { parentFolderId: parentId, workspaceId: WS_ID });

    const nested = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: parentId,
    });
    expect(nested).toHaveLength(1);

    // Different workspace should return empty
    const other = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS2_ID,
      parentFolderId: null,
    });
    expect(other).toHaveLength(0);
  });
});

describe("immutability", () => {
  it("does not mutate existing folder objects on rename", async () => {
    const { commands } = setup();
    await commands.send(FOLDERS_CREATE, { workspaceId: WS_ID });

    const before = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    const folderId = before[0]?.id;
    const originalName = before[0]?.name;

    // Hold reference to the object
    const ref = before[0];
    expect(ref).toBeDefined();

    await commands.send(FOLDERS_RENAME, { folderId, name: "Changed" });

    const after = await commands.send(FOLDERS_GET_FOR_LEVEL, {
      workspaceId: WS_ID,
      parentFolderId: null,
    });
    expect(after[0]?.name).toBe("Changed");

    // The original reference should NOT have been mutated
    // (This verifies the immutable update pattern works)
    expect(ref.name).toBe(originalName);
  });
});

describe("start()", () => {
  it("loads persisted folders and emits CHANGED", async () => {
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const dataStore = new MemoryDataStore();

    // Pre-populate persistence
    const coll = dataStore.collection("folders");
    await coll.insert({
      id: "f1",
      workspaceId: "ws-1",
      name: "Saved Folder",
      parentFolderId: null,
      collapsed: false,
      order: 0,
    });

    const deps = {
      commands,
      events,
      dataStore,
      getActiveTabId: () => undefined as TabId | undefined,
      getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
      getTab: () => undefined,
      getTabsForWorkspace: () => [] as Tab[],
      setTabFolderId: () => {},
      setTabOrder: () => {},
    };

    feature.register(deps);

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await start(deps);

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        folders: expect.arrayContaining([expect.objectContaining({ name: "Saved Folder" })]),
      }),
    );
  });

  it("does not emit when no persisted folders", async () => {
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const dataStore = new MemoryDataStore();

    const deps = {
      commands,
      events,
      dataStore,
      getActiveTabId: () => undefined as TabId | undefined,
      getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
      getTab: () => undefined,
      getTabsForWorkspace: () => [] as Tab[],
      setTabFolderId: () => {},
      setTabOrder: () => {},
    };

    feature.register(deps);

    const changed = vi.fn();
    events.on(FOLDERS_CHANGED, changed);

    await start(deps);

    expect(changed).not.toHaveBeenCalled();
  });
});

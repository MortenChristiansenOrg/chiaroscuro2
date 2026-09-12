import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";

// Must mock cross-feature imports before importing feature modules
vi.mock("../pinned-tabs/pinned-tabs.main", () => ({
  isPinned: vi.fn(() => false),
}));
vi.mock("../folders/folders.main", () => ({
  getFoldersForLevel: vi.fn(() => []),
  setFolderOrder: vi.fn(),
}));

import { isPinned } from "../pinned-tabs/pinned-tabs.main";
import tabsFeature from "../tabs/tabs.main";
import {
  TABS_ACTIVATE,
  TABS_ADOPT,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CREATE,
  TABS_CREATED,
  TABS_GET,
  TABS_LIST_CHANGED,
  TABS_REPORT_CONTENT_BOUNDS,
  TABS_UPDATED,
  type Tab,
  type TabsCommands,
  type TabsEvents,
} from "../tabs/tabs.shared";
import type { TabLoadingChangedPayload } from "../window-chrome/window-chrome.shared";
import subTabsFeature from "./sub-tabs.main";
import {
  SUB_TABS_CLOSE,
  SUB_TABS_CLOSE_ALL,
  SUB_TABS_CLOSED,
  SUB_TABS_GET_STACK,
  SUB_TABS_OPEN,
  SUB_TABS_OPENED,
  SUB_TABS_PROMOTE,
  SUB_TABS_PROMOTED,
  SUB_TABS_STACK_CHANGED,
  type SubTab,
  type SubTabsCommands,
  type SubTabsEvents,
} from "./sub-tabs.shared";

const WIN_ID = "win-1" as WindowId;
const WS_ID = "ws-1" as WorkspaceId;

type AllCommands = TabsCommands & SubTabsCommands;
type AllEvents = TabsEvents & SubTabsEvents & { "tab:loading-changed": TabLoadingChangedPayload };

let tabCounter = 0;

function setup(platformOverrides = {}) {
  tabCounter = 0;
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform({
    createTab: vi.fn(async () => `tab-${++tabCounter}` as TabId),
    closeTab: vi.fn(async () => {}),
    getTabUrl: vi.fn((id: TabId) => `https://example.com/${id}`),
    getTabTitle: vi.fn((id: TabId) => `Title ${id}`),
    ...platformOverrides,
  });

  // In-memory data store stub
  const dataStore = {
    initialize: vi.fn(async () => {}),
    collection: () => ({
      upsert: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      findMany: vi.fn(async () => []),
    }),
  };

  let activeTabId: TabId | undefined;
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
    getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
  };

  // Register tabs feature first (sub-tabs depends on tabs:adopt)
  tabsFeature.register({
    ...deps,
    isPinned: (id: TabId) => isPinned(id),
    getCustomization: () => undefined as { fixedAddressDisabled: boolean } | undefined,
    getFoldersForLevel: () => [] as { id: import("../../shared/types").FolderId; order: number }[],
    setFolderOrder: () => {},
    isPrivacyWorkspace: () => false,
  });

  // Register sub-tabs
  subTabsFeature.register(deps);

  // Set content bounds so tabs can be positioned
  commands.send(TABS_REPORT_CONTENT_BOUNDS, { x: 0, y: 0, width: 1000, height: 800 });

  return {
    commands,
    events,
    platform,
    getActiveTabId: () => activeTabId,
    setActiveTabId: (id: TabId | undefined) => {
      activeTabId = id;
    },
  };
}

async function createParentTab(ctx: ReturnType<typeof setup>): Promise<{ tabId: TabId; tab: Tab }> {
  const tabCreated = new Promise<Tab>((resolve) => {
    ctx.events.on(TABS_CREATED, ({ tab }) => resolve(tab));
  });
  const tabId = await ctx.commands.send(TABS_CREATE, { url: "https://parent.com" });
  const tab = await tabCreated;
  return { tabId, tab };
}

describe("sub-tabs:open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("opens a sub-tab and emits opened + stack-changed events", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const opened: { parentTabId: TabId; subTab: SubTab }[] = [];
    const stacks: { parentTabId: TabId; stack: SubTab[] }[] = [];
    ctx.events.on(SUB_TABS_OPENED, (e) => opened.push(e));
    ctx.events.on(SUB_TABS_STACK_CHANGED, (e) => stacks.push(e));

    const subTabId = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    expect(subTabId).toBeDefined();
    expect(opened).toHaveLength(1);
    expect(opened[0].parentTabId).toBe(parentId);
    expect(opened[0].subTab.url).toBe("https://child.com");
    expect(stacks).toHaveLength(1);
    expect(stacks[0].stack).toHaveLength(1);
  });

  it("injects CSS with input blocking on first sub-tab open", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    // CSS should block input (backdrop is handled by native overlay)
    expect(ctx.platform.insertCSS).toHaveBeenCalledWith(
      parentId,
      expect.stringContaining("pointer-events"),
    );
  });

  it("shows sub-tab window on first sub-tab open", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    expect(ctx.platform.showSubTabWindow).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number) }),
      expect.objectContaining({ width: expect.any(Number) }),
      parentId,
    );
  });

  it("does not show sub-tab window on subsequent sub-tab opens", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child1.com",
    });
    (ctx.platform.showSubTabWindow as ReturnType<typeof vi.fn>).mockClear();

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child2.com",
    });

    expect(ctx.platform.showSubTabWindow).not.toHaveBeenCalled();
  });

  it("stacks multiple sub-tabs, hides previous", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const sub1 = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child1.com",
    });
    const sub2 = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child2.com",
    });

    // sub1 should have been hidden when sub2 opened
    expect(ctx.platform.hideTab).toHaveBeenCalledWith(sub1);

    const stack = await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: parentId });
    expect(stack).toHaveLength(2);
    expect(stack[0].id).toBe(sub1);
    expect(stack[1].id).toBe(sub2);
  });
});

describe("sub-tabs:close", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("closes the topmost sub-tab", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const subTabId = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    const closed: { parentTabId: TabId; subTabId: TabId }[] = [];
    ctx.events.on(SUB_TABS_CLOSED, (e) => closed.push(e));

    await ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: parentId });

    expect(closed).toHaveLength(1);
    expect(closed[0].subTabId).toBe(subTabId);
    expect(ctx.platform.closeTab).toHaveBeenCalledWith(subTabId);

    const stack = await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: parentId });
    expect(stack).toHaveLength(0);
  });

  it("hides sub-tab window when last sub-tab closes", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    await ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: parentId });

    expect(ctx.platform.hideSubTabWindow).toHaveBeenCalled();
  });

  it("reveals previous sub-tab when top is closed (not last)", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child1.com",
    });
    const sub1Id = (await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: parentId }))[0].id;

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child2.com",
    });

    // Close top (child2)
    await ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: parentId });

    // sub1 should be re-attached to child window with computed frame bounds
    expect(ctx.platform.attachTabToSubTabWindow).toHaveBeenCalledWith(
      sub1Id,
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });

  it("re-enables parent input when last sub-tab is closed", async () => {
    const cssKey = "css-key-1";
    const ctx = setup({ insertCSS: vi.fn(async () => cssKey) });
    const { tabId: parentId } = await createParentTab(ctx);

    await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    expect(ctx.platform.insertCSS).toHaveBeenCalledWith(
      parentId,
      expect.stringContaining("pointer-events"),
    );

    await ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: parentId });

    // Wait for async CSS removal
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.platform.removeInsertedCSS).toHaveBeenCalledWith(parentId, cssKey);
  });
});

describe("sub-tabs:close-all", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("closes all sub-tabs for a parent", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const sub1 = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child1.com",
    });
    const sub2 = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child2.com",
    });

    await ctx.commands.send(SUB_TABS_CLOSE_ALL, { parentTabId: parentId });

    expect(ctx.platform.closeTab).toHaveBeenCalledWith(sub2);
    expect(ctx.platform.closeTab).toHaveBeenCalledWith(sub1);
    expect(ctx.platform.hideSubTabWindow).toHaveBeenCalled();

    const stack = await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: parentId });
    expect(stack).toHaveLength(0);
  });
});

describe("sub-tabs:promote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("promotes top sub-tab to standalone tab", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const subTabId = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    const promoted: { parentTabId: TabId; subTabId: TabId; newTabId: TabId }[] = [];
    ctx.events.on(SUB_TABS_PROMOTED, (e) => promoted.push(e));

    const tabCreated: Tab[] = [];
    ctx.events.on(TABS_CREATED, ({ tab }) => tabCreated.push(tab));

    vi.advanceTimersByTime(0); // flush pending timeouts

    const newTabId = await ctx.commands.send(SUB_TABS_PROMOTE, { parentTabId: parentId });

    expect(promoted).toHaveLength(1);
    expect(promoted[0].subTabId).toBe(subTabId);
    expect(promoted[0].newTabId).toBe(newTabId);

    // The adopted tab should appear in tabs:created
    expect(tabCreated.some((t) => t.id === subTabId)).toBe(true);

    // Sub-tab stack should be empty
    const stack = await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: parentId });
    expect(stack).toHaveLength(0);
  });
});

describe("parent tab lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("closes sub-tabs when parent tab is closed", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const sub1 = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child1.com",
    });

    vi.advanceTimersByTime(0);

    // Close parent
    await ctx.commands.send(TABS_CLOSE, { tabId: parentId });

    // Sub-tab should have been closed
    expect(ctx.platform.closeTab).toHaveBeenCalledWith(sub1);
  });
});

describe("content bounds positioning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("repositions sub-tab when content bounds change", async () => {
    const ctx = setup();
    const { tabId: parentId } = await createParentTab(ctx);

    const subTabId = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: parentId,
      url: "https://child.com",
    });

    // Update content bounds → sub-tab should reposition
    await ctx.commands.send(TABS_REPORT_CONTENT_BOUNDS, {
      x: 50,
      y: 40,
      width: 900,
      height: 700,
    });

    // attachTabToSubTabWindow should have been called with computed frame bounds
    expect(ctx.platform.attachTabToSubTabWindow).toHaveBeenCalledWith(
      subTabId,
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });
});

describe("window-open interception", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("registers onWindowOpen callback", () => {
    const ctx = setup();
    expect(ctx.platform.onWindowOpen).toHaveBeenCalled();
  });
});

describe("interrupted sub-tab transitions", () => {
  afterEach(() => {
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("orders close after an in-flight open and does not leave a view attached", async () => {
    let finishEnter!: () => void;
    const show = new Promise<void>((resolve) => {
      finishEnter = resolve;
    });
    const ctx = setup({ showSubTabWindow: vi.fn(() => show) });
    const { tabId } = await createParentTab(ctx);
    const opening = ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://child.com",
    });
    await vi.waitFor(() => expect(ctx.platform.showSubTabWindow).toHaveBeenCalled());
    const closing = ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: tabId });
    finishEnter();
    const childId = await opening;
    await closing;
    expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
    expect(ctx.platform.detachTabFromSubTabWindow).toHaveBeenCalledWith(childId);
    expect(ctx.platform.closeTab).toHaveBeenCalledWith(childId);
  });

  it("keeps a new open alive when requested during the last sub-tab exit", async () => {
    let finishExit!: () => void;
    const hide = new Promise<void>((resolve) => {
      finishExit = resolve;
    });
    const ctx = setup({ hideSubTabWindow: vi.fn(() => hide) });
    const { tabId } = await createParentTab(ctx);
    const first = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://first.com",
    });
    const closing = ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: tabId });
    await vi.waitFor(() => expect(ctx.platform.hideSubTabWindow).toHaveBeenCalled());
    const opening = ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://second.com",
    });
    finishExit();
    await closing;
    const second = await opening;
    expect(
      (await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).map((st) => st.id),
    ).toEqual([second]);
    expect(ctx.platform.closeTab).toHaveBeenCalledWith(first);
    expect(ctx.platform.closeTab).not.toHaveBeenCalledWith(second);
  });

  it("does not resurrect a child when its parent closes during backdrop entry", async () => {
    let finishEnter!: () => void;
    const show = new Promise<void>((resolve) => {
      finishEnter = resolve;
    });
    const ctx = setup({ showSubTabWindow: vi.fn(() => show) });
    const { tabId } = await createParentTab(ctx);
    const opening = ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://child.com",
    });
    await vi.waitFor(() => expect(ctx.platform.showSubTabWindow).toHaveBeenCalled());
    await ctx.commands.send(TABS_CLOSE, { tabId });
    finishEnter();
    const childId = await opening;
    await vi.waitFor(async () => {
      expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
    });
    expect(ctx.platform.attachTabToSubTabWindow).not.toHaveBeenCalledWith(
      childId,
      expect.anything(),
    );
    expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
  });
});

describe("sub-tab exit across parent switching", () => {
  afterEach(() => {
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("hides the backdrop when returning to a parent whose last child is still closing", async () => {
    let finishExit!: () => void;
    const hide = new Promise<void>((resolve) => {
      finishExit = resolve;
    });
    const ctx = setup({ hideSubTabWindow: vi.fn(() => hide) });
    const { tabId } = await createParentTab(ctx);
    await ctx.commands.send(SUB_TABS_OPEN, { parentTabId: tabId, url: "https://child.com" });
    const closing = ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: tabId });
    await vi.waitFor(() => expect(ctx.platform.hideSubTabWindow).toHaveBeenCalled());
    const other = await ctx.commands.send(TABS_CREATE, { url: "https://other.com" });
    expect(other).not.toBe(tabId);
    await ctx.commands.send(TABS_ACTIVATE, { tabId });
    expect(ctx.platform.showSubTabWindowStatic).toHaveBeenCalled();
    vi.mocked(ctx.platform.hideSubTabWindowInstant).mockClear();
    finishExit();
    await closing;
    expect(ctx.platform.hideSubTabWindowInstant).toHaveBeenCalledOnce();
    expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
  });
});

describe("sub-tab native close lifecycle", () => {
  afterEach(() => {
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("does not start the next open until native destruction completes", async () => {
    let finishClose!: () => void;
    const nativeClose = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const ctx = setup({ closeTab: vi.fn(() => nativeClose) });
    const { tabId } = await createParentTab(ctx);
    const first = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://first.com",
    });
    const closing = ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: tabId });
    await vi.waitFor(() => expect(ctx.platform.closeTab).toHaveBeenCalledWith(first));
    const opening = ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://second.com",
    });
    expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toHaveLength(1);
    expect(ctx.platform.createTab).toHaveBeenCalledTimes(2);
    finishClose();
    await closing;
    const second = await opening;
    expect(
      (await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).map((st) => st.id),
    ).toEqual([second]);
  });

  it("restores a visible child and retains its stack when native close is vetoed", async () => {
    const ctx = setup({
      closeTab: vi.fn(async () => {
        throw new Error("Page prevented closing");
      }),
    });
    const { tabId } = await createParentTab(ctx);
    const child = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://child.com",
    });
    const closed = vi.fn();
    ctx.events.on(SUB_TABS_CLOSED, closed);
    await expect(ctx.commands.send(SUB_TABS_CLOSE, { parentTabId: tabId })).rejects.toThrow(
      "Page prevented closing",
    );
    expect(
      (await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).map((st) => st.id),
    ).toEqual([child]);
    expect(closed).not.toHaveBeenCalled();
    expect(ctx.platform.showSubTabWindowStatic).toHaveBeenCalled();
    expect(ctx.platform.attachTabToSubTabWindow).toHaveBeenLastCalledWith(child, expect.anything());
  });
});

describe("parent close with pending or prevented child destruction", () => {
  afterEach(() => {
    tabsFeature.teardown?.();
    subTabsFeature.teardown?.();
  });

  it("keeps ownership until a child's native close settles", async () => {
    const ctx = setup();
    const { tabId } = await createParentTab(ctx);
    const child = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://child.com",
    });
    let finishClose!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    vi.mocked(ctx.platform.closeTab).mockImplementation((id) =>
      id === child ? pending : Promise.resolve(),
    );
    await ctx.commands.send(TABS_CLOSE, { tabId });
    await vi.waitFor(() => expect(ctx.platform.closeTab).toHaveBeenCalledWith(child));
    expect(
      (await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).map((st) => st.id),
    ).toEqual([child]);
    finishClose();
    await vi.waitFor(async () => {
      expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
    });
  });

  it("adopts a vetoing child as a standalone tab before removing its stack record", async () => {
    const ctx = setup();
    const { tabId } = await createParentTab(ctx);
    const child = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://child.com",
    });
    vi.mocked(ctx.platform.closeTab).mockImplementation(async (id) => {
      if (id === child) throw new Error("Page prevented closing");
    });
    await ctx.commands.send(TABS_CLOSE, { tabId });
    await vi.waitFor(async () => {
      expect(await ctx.commands.send(TABS_GET, { tabId: child })).toMatchObject({ id: child });
      expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
    });
    expect(ctx.getActiveTabId()).toBe(child);
    expect(ctx.platform.createTab).toHaveBeenCalledTimes(2);
  });

  it("preserves nested vetoing children and keeps the topmost one active", async () => {
    const ctx = setup();
    const { tabId } = await createParentTab(ctx);
    const lower = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://lower.com",
    });
    const upper = await ctx.commands.send(SUB_TABS_OPEN, {
      parentTabId: tabId,
      url: "https://upper.com",
    });
    vi.mocked(ctx.platform.closeTab).mockImplementation(async (id) => {
      if (id !== tabId) throw new Error("Page prevented closing");
    });
    await ctx.commands.send(TABS_CLOSE, { tabId });
    await vi.waitFor(async () => {
      expect(await ctx.commands.send(TABS_GET, { tabId: lower })).toMatchObject({ id: lower });
      expect(await ctx.commands.send(TABS_GET, { tabId: upper })).toMatchObject({ id: upper });
      expect(await ctx.commands.send(SUB_TABS_GET_STACK, { parentTabId: tabId })).toEqual([]);
    });
    expect(ctx.getActiveTabId()).toBe(upper);
  });
});

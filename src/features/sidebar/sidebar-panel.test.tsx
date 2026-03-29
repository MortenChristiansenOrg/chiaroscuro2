import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId, WorkspaceId } from "../../shared/types";
import { makePinnedTab, makeTab, makeWorkspace } from "../../test-utils";
import { useAppStateStore } from "../app-state/app-state.store";
import type { PinnedTab } from "../pinned-tabs/pinned-tabs.shared";
import { usePinnedTabsStore } from "../pinned-tabs/pinned-tabs.store";
import type { Tab } from "../tabs/tabs.shared";
import { useTabsStore } from "../tabs/tabs.store";
import type { Workspace } from "../workspaces/workspaces.shared";
import { useWorkspacesStore } from "../workspaces/workspaces.store";
import { SidebarPanel } from "./sidebar.renderer";
import { useSidebarStore } from "./sidebar.store";

// ── Mocks ───────────────────────────────────────────────────────

const mockSendCommand = vi.fn(() => Promise.resolve());
Object.defineProperty(window, "chiaroscuro", {
  value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
  writable: true,
  configurable: true,
});

// ── Helpers ─────────────────────────────────────────────────────

function setStores(
  opts: {
    visible?: boolean;
    announcement?: string;
    sidebarWidth?: number;
    tabs?: Tab[];
    activeTabId?: TabId | null;
    pinnedTabs?: PinnedTab[];
    workspaces?: Workspace[];
    activeWorkspaceId?: WorkspaceId | null;
  } = {},
) {
  useAppStateStore.setState({
    sidebarWidth: opts.sidebarWidth ?? 240,
  });

  useSidebarStore.setState({
    visible: opts.visible ?? true,
    announcement: opts.announcement ?? "",
  });

  const tabMap = new Map<TabId, Tab>();
  for (const t of opts.tabs ?? []) tabMap.set(t.id, t);
  useTabsStore.setState({
    tabs: tabMap,
    activeTabId: opts.activeTabId ?? null,
  });

  usePinnedTabsStore.setState({
    pinnedTabs: opts.pinnedTabs ?? [],
    activePinnedTabId: null,
  });

  useWorkspacesStore.setState({
    workspaces: opts.workspaces ?? [makeWorkspace()],
    activeWorkspaceId: opts.activeWorkspaceId ?? ("ws-1" as WorkspaceId),
  });
}

function getNav() {
  return screen.getByRole("navigation", { name: "Sidebar" });
}

function getOuterDiv() {
  // Structure: outer (width/overflow) > inner (relative flex) > nav
  const el = getNav().parentElement?.parentElement;
  if (!el) throw new Error("Sidebar nav has no outer container");
  return el;
}

// ── Tests ───────────────────────────────────────────────────────

describe("SidebarPanel", () => {
  beforeEach(() => {
    mockSendCommand.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Layout & visibility ──────────────────────────────────────

  describe("layout", () => {
    it("renders nav with Sidebar aria-label", () => {
      setStores();
      render(<SidebarPanel />);
      expect(getNav()).toBeTruthy();
    });

    it("has sidebar width when visible", () => {
      setStores({ visible: true });
      render(<SidebarPanel />);
      expect(getOuterDiv().style.width).toBe("240px");
    });

    it("has zero width when collapsed", () => {
      setStores({ visible: false });
      render(<SidebarPanel />);
      expect(getOuterDiv().style.width).toBe("0px");
    });

    it("applies width transition for collapse animation", () => {
      setStores();
      render(<SidebarPanel />);
      expect(getOuterDiv().style.transition).toContain("width");
    });
  });

  // ── Pinned tabs ──────────────────────────────────────────────

  describe("pinned tabs strip", () => {
    it("renders pinned tab buttons when pinned tabs exist", () => {
      const pt = makePinnedTab({ id: "pt-1" as TabId, title: "Pinned" });
      setStores({ pinnedTabs: [pt] });
      render(<SidebarPanel />);
      expect(screen.getByRole("button", { name: "Pinned" })).toBeTruthy();
    });

    it("hides strip when no pinned tabs", () => {
      setStores({ pinnedTabs: [] });
      render(<SidebarPanel />);
      expect(screen.queryByRole("button", { name: "Pinned" })).toBeNull();
    });

    it("sends pinned-tabs:activate on pinned tab click", () => {
      const pt = makePinnedTab({ id: "pt-1" as TabId, title: "Pinned" });
      setStores({ pinnedTabs: [pt] });
      render(<SidebarPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Pinned" }));
      expect(mockSendCommand).toHaveBeenCalledWith("pinned-tabs:activate", {
        tabId: "pt-1",
      });
    });

    it("highlights active pinned tab", () => {
      const pt = makePinnedTab({ id: "pt-1" as TabId, title: "Pinned" });
      setStores({ pinnedTabs: [pt], activeTabId: "pt-1" as TabId });
      render(<SidebarPanel />);
      const btn = screen.getByRole("button", { name: "Pinned" });
      expect(btn.className).toContain("bg-glass-active");
    });
  });

  // ── Tab filtering ────────────────────────────────────────────

  describe("tab filtering", () => {
    it("shows only tabs for the active workspace", () => {
      const tab1 = makeTab({
        id: "t1" as TabId,
        workspaceId: "ws-1" as WorkspaceId,
        title: "WS1 Tab",
      });
      const tab2 = makeTab({
        id: "t2" as TabId,
        workspaceId: "ws-2" as WorkspaceId,
        title: "WS2 Tab",
      });
      setStores({
        tabs: [tab1, tab2],
        workspaces: [
          makeWorkspace({ id: "ws-1" as WorkspaceId }),
          makeWorkspace({ id: "ws-2" as WorkspaceId, name: "Personal" }),
        ],
        activeWorkspaceId: "ws-1" as WorkspaceId,
      });
      render(<SidebarPanel />);
      expect(screen.getByText("WS1 Tab")).toBeTruthy();
      expect(screen.queryByText("WS2 Tab")).toBeNull();
    });

    it("excludes pinned tabs from workspace tab list", () => {
      const pinnedTab = makeTab({ id: "pt-1" as TabId, title: "Pinned Tab" });
      const regularTab = makeTab({ id: "t1" as TabId, title: "Regular Tab" });
      const pt = makePinnedTab({ id: "pt-1" as TabId, title: "Pinned Tab" });
      setStores({ tabs: [pinnedTab, regularTab], pinnedTabs: [pt] });
      render(<SidebarPanel />);
      const tabIds = [...document.querySelectorAll("[data-tab-id]")].map((el) =>
        el.getAttribute("data-tab-id"),
      );
      expect(tabIds).toContain("t1");
      expect(tabIds).not.toContain("pt-1");
    });
  });

  // ── Bookmarked vs ephemeral sections ─────────────────────────

  describe("tab sections", () => {
    it("renders bookmarked tabs", () => {
      const tab = makeTab({ id: "t1" as TabId, bookmarked: true, title: "Bookmarked" });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      expect(screen.getByText("Bookmarked")).toBeTruthy();
    });

    it("renders ephemeral tabs with muted styling", () => {
      const tab = makeTab({ id: "t1" as TabId, bookmarked: false, title: "Ephemeral" });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      const title = screen.getByText("Ephemeral");
      expect(title.className).toContain("text-glass-text-muted");
    });

    it("shows Clear button when ephemeral tabs exist", () => {
      const tab = makeTab({ id: "t1" as TabId, bookmarked: false });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      expect(screen.getByText("Clear")).toBeTruthy();
    });

    it("hides Clear button when no ephemeral tabs", () => {
      const tab = makeTab({ id: "t1" as TabId, bookmarked: true });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      expect(screen.queryByText("Clear")).toBeNull();
    });

    it("sends tabs:clear-ephemeral on Clear click", () => {
      const tab = makeTab({ id: "t1" as TabId, bookmarked: false });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      fireEvent.click(screen.getByText("Clear"));
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:clear-ephemeral", {
        workspaceId: "ws-1",
      });
    });

    it("renders both bookmarked and ephemeral in correct order", () => {
      const bTab = makeTab({
        id: "t1" as TabId,
        bookmarked: true,
        title: "Book",
        order: 0,
      });
      const eTab = makeTab({
        id: "t2" as TabId,
        bookmarked: false,
        title: "Ephem",
        order: 1,
      });
      setStores({ tabs: [bTab, eTab] });
      render(<SidebarPanel />);
      const tabEls = [...document.querySelectorAll("[data-tab-id]")];
      expect(tabEls[0]?.getAttribute("data-tab-id")).toBe("t1");
      expect(tabEls[1]?.getAttribute("data-tab-id")).toBe("t2");
    });
  });

  // ── Accessibility ─────────────────────────────────────────────

  describe("accessibility", () => {
    it("has live region for announcements", () => {
      setStores({ announcement: "Switched to Work, 3 tabs" });
      render(<SidebarPanel />);
      const liveRegion = getNav().querySelector("[aria-live='polite']");
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.textContent).toBe("Switched to Work, 3 tabs");
    });

    it("live region is screen-reader only", () => {
      setStores();
      render(<SidebarPanel />);
      const liveRegion = getNav().querySelector("[aria-live='polite']");
      expect(liveRegion?.className).toContain("sr-only");
    });
  });

  // ── Workspace switcher ───────────────────────────────────────

  describe("workspace switcher", () => {
    it("renders workspace bubbles", () => {
      setStores({
        workspaces: [
          makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work" }),
          makeWorkspace({ id: "ws-2" as WorkspaceId, name: "Personal" }),
        ],
      });
      render(<SidebarPanel />);
      expect(screen.getByRole("button", { name: "Work" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Personal" })).toBeTruthy();
    });

    it("workspace bubble supports context menu", () => {
      setStores({
        workspaces: [makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work" })],
      });
      render(<SidebarPanel />);
      fireEvent.contextMenu(screen.getByRole("button", { name: "Work" }));
      expect(mockSendCommand).toHaveBeenCalledWith(
        "context-menu:show",
        expect.objectContaining({
          items: [
            expect.objectContaining({ label: "Edit workspace" }),
            expect.objectContaining({ label: "Add workspace" }),
          ],
        }),
      );
    });
  });

  // ── Drag state ───────────────────────────────────────────────

  describe("drag state", () => {
    it("sets isDragging on dragStart within nav", () => {
      const tab = makeTab({ id: "t1" as TabId, title: "Draggable" });
      setStores({ tabs: [tab] });
      render(<SidebarPanel />);
      const tabEl = document.querySelector("[data-tab-id='t1']");
      expect(tabEl).toBeTruthy();
      fireEvent.dragStart(tabEl as Element, { dataTransfer: new DataTransfer() });
      // During drag, group class is removed from tab items
      expect(tabEl.classList.contains("group")).toBe(false);
    });
  });
});

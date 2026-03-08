import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useContextMenu } from "../../renderer/src/components/ContextMenu";
import type { FolderId, TabId, WorkspaceId } from "../../shared/types";
import {
  APP_STATE_SET_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../app-state/app-state.shared";
// shell-composite: read-only cross-feature store access
import { useAppStateStore } from "../app-state/app-state.store";
import { DownloadsSection } from "../downloads/downloads.renderer";
import type { Folder, FoldersCommands } from "../folders/folders.shared";
import { FOLDERS_CREATE } from "../folders/folders.shared";
// shell-composite: read-only cross-feature store access
import { useFoldersStore } from "../folders/folders.store";
import { UpdateNotification } from "../installer/installer.renderer";
// shell-composite: read-only cross-feature store access
import { usePinnedTabsStore } from "../pinned-tabs/pinned-tabs.store";
import type { Tab } from "../tabs/tabs.shared";
import { TABS_CLEAR_EPHEMERAL } from "../tabs/tabs.shared";
// shell-composite: read-only cross-feature store access
import { useTabsStore } from "../tabs/tabs.store";
import { WorkspaceSwitcher } from "../workspaces/workspaces.renderer";
import type { Workspace } from "../workspaces/workspaces.shared";
// shell-composite: read-only cross-feature store access
import { useWorkspacesStore } from "../workspaces/workspaces.store";
import { PinnedTabsStrip } from "./PinnedTabsStrip";
import { TabSection } from "./TabSection";
import { useSidebarStore } from "./sidebar.store";

// ── Re-exports for external consumers ───────────────────────────

export { hashToHue, Favicon } from "./Favicon";
export { TabItem } from "./TabItem";
export { PinnedTabsStrip } from "./PinnedTabsStrip";

// ── Shared types ────────────────────────────────────────────────

export type TreeItem =
  | { type: "tab"; tab: Tab }
  | { type: "folder"; folder: Folder; children: TreeItem[] };

// ── Typed sendCommand ───────────────────────────────────────────

type SidebarUsedCommands = Pick<FoldersCommands, typeof FOLDERS_CREATE>;

function sendFolderCommand<K extends keyof SidebarUsedCommands>(
  name: K,
  payload: SidebarUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Tree building ───────────────────────────────────────────────

function buildBookmarkedTree(
  tabs: Tab[],
  folders: Map<FolderId, Folder>,
  workspaceId: WorkspaceId | null,
): TreeItem[] {
  if (!workspaceId) return tabs.map((t) => ({ type: "tab" as const, tab: t }));

  const wsFolders = [...folders.values()].filter((f) => f.workspaceId === workspaceId);

  function buildLevel(parentFolderId: FolderId | null): TreeItem[] {
    const levelFolders = wsFolders
      .filter((f) => f.parentFolderId === parentFolderId)
      .sort((a, b) => a.order - b.order);

    const levelTabs = tabs
      .filter((t) => (t.folderId ?? null) === parentFolderId)
      .sort((a, b) => a.order - b.order);

    // Merge folders and tabs into a single list sorted by order (unified ordering)
    type Entry =
      | { type: "folder"; order: number; folder: Folder }
      | { type: "tab"; order: number; tab: Tab };
    const entries: Entry[] = [
      ...levelFolders.map((f) => ({ type: "folder" as const, order: f.order, folder: f })),
      ...levelTabs.map((t) => ({ type: "tab" as const, order: t.order, tab: t })),
    ].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      // Tiebreaker: folders before tabs
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return 0;
    });

    return entries.map((entry) =>
      entry.type === "folder"
        ? { type: "folder" as const, folder: entry.folder, children: buildLevel(entry.folder.id) }
        : { type: "tab" as const, tab: entry.tab },
    );
  }

  return buildLevel(null);
}

// ── Hooks ───────────────────────────────────────────────────────

function useExitAnimation(tabs: Map<TabId, Tab>) {
  const prevTabsRef = useRef(new Map<TabId, Tab>());
  const [exitingTabs, setExitingTabs] = useState<Tab[]>([]);

  // useLayoutEffect so the exiting tab stays in the DOM before the browser paints
  useLayoutEffect(() => {
    const prev = prevTabsRef.current;
    const removed: Tab[] = [];
    for (const [id, tab] of prev) {
      if (!tabs.has(id)) removed.push(tab);
    }
    prevTabsRef.current = new Map(tabs);
    if (removed.length === 0) return;
    setExitingTabs(removed);
    const timer = setTimeout(() => setExitingTabs([]), 200);
    return () => clearTimeout(timer);
  }, [tabs]);

  const exitingIds = new Set(exitingTabs.map((t) => t.id));
  return { exitingTabs, exitingIds };
}

const WS_SLIDE_MS = 300;

function useWorkspaceSlide(activeWorkspaceId: WorkspaceId | null, workspaces: Workspace[]) {
  const prevWsIdRef = useRef(activeWorkspaceId);
  const [transition, setTransition] = useState<{
    direction: "left" | "right";
    fromWorkspaceId: WorkspaceId;
  } | null>(null);

  useLayoutEffect(() => {
    const prevId = prevWsIdRef.current;
    prevWsIdRef.current = activeWorkspaceId;

    if (!prevId || !activeWorkspaceId || prevId === activeWorkspaceId) return;

    const prevIndex = workspaces.findIndex((w) => w.id === prevId);
    const newIndex = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    if (prevIndex === -1 || newIndex === -1) return;

    const direction = newIndex > prevIndex ? "right" : "left";
    setTransition({ direction, fromWorkspaceId: prevId });

    const timer = setTimeout(() => setTransition(null), WS_SLIDE_MS);
    return () => clearTimeout(timer);
  }, [activeWorkspaceId, workspaces]);

  return transition;
}

// ── Resize hook ─────────────────────────────────────────────────

function useSidebarResize(sidebarWidth: number) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;
      setDragWidth(sidebarWidth);

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
    },
    [sidebarWidth],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragWidth === null) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, startWidthRef.current + delta),
      );
      setDragWidth(newWidth);
    },
    [dragWidth],
  );

  const onPointerUp = useCallback(() => {
    if (dragWidth === null) return;
    const finalWidth = Math.round(dragWidth);
    setDragWidth(null);
    window.chiaroscuro.sendCommand(APP_STATE_SET_SIDEBAR_WIDTH, { width: finalWidth });
  }, [dragWidth]);

  return {
    width: dragWidth ?? sidebarWidth,
    isResizing: dragWidth !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}

// ── Main Component ──────────────────────────────────────────────

export function SidebarPanel() {
  const visible = useSidebarStore((s) => s.visible);
  const announcement = useSidebarStore((s) => s.announcement);
  const sidebarWidth = useAppStateStore((s) => s.sidebarWidth);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const pinnedTabs = usePinnedTabsStore((s) => s.pinnedTabs);
  const pinnedTabIds = useMemo(() => new Set(pinnedTabs.map((p) => p.id)), [pinnedTabs]);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const folders = useFoldersStore((s) => s.folders);
  const renamingFolderId = useFoldersStore((s) => s.renamingFolderId);

  // Workspace editor state
  const [editorMode, setEditorMode] = useState<"none" | "new" | WorkspaceId>("none");

  // Exit animation
  const { exitingTabs, exitingIds } = useExitAnimation(tabs);

  // Workspace slide transition
  const wsTransition = useWorkspaceSlide(activeWorkspaceId, workspaces);

  // Derive filtered tab lists
  const all = [...tabs.values()].filter(
    (t) => t.workspaceId === activeWorkspaceId && !pinnedTabIds.has(t.id),
  );
  const exitingInWorkspace = exitingTabs.filter(
    (t) => t.workspaceId === activeWorkspaceId && !pinnedTabIds.has(t.id),
  );
  const bookmarked = [
    ...all.filter((t) => t.bookmarked),
    ...exitingInWorkspace.filter((t) => t.bookmarked),
  ].sort((a, b) => a.order - b.order);
  const ephemeral = [
    ...all.filter((t) => !t.bookmarked),
    ...exitingInWorkspace.filter((t) => !t.bookmarked),
  ].sort((a, b) => a.order - b.order);

  // Build folder tree for bookmarked tabs
  const bookmarkedTree = useMemo(
    () => buildBookmarkedTree(bookmarked, folders, activeWorkspaceId),
    [bookmarked, folders, activeWorkspaceId],
  );

  // Previous workspace tabs (for slide-out during transition)
  const prevTabs = useMemo(() => {
    if (!wsTransition) return null;
    const prevAll = [...tabs.values()].filter(
      (t) => t.workspaceId === wsTransition.fromWorkspaceId && !pinnedTabIds.has(t.id),
    );
    const prevBookmarked = prevAll.filter((t) => t.bookmarked).sort((a, b) => a.order - b.order);
    return {
      bookmarked: prevBookmarked,
      bookmarkedTree: buildBookmarkedTree(prevBookmarked, folders, wsTransition.fromWorkspaceId),
      ephemeral: prevAll.filter((t) => !t.bookmarked).sort((a, b) => a.order - b.order),
    };
  }, [wsTransition, tabs, pinnedTabIds, folders]);

  // Drag & drop
  const dragTabIdRef = useRef<TabId | null>(null);
  const dragFolderIdRef = useRef<FolderId | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Safety net: when React repositions the drag source DOM node mid-drag
  // (cross-section reorder), Chrome loses track of it and never fires dragend.
  // Listen for drop (which does fire) + dragend + Escape as fallbacks.
  useEffect(() => {
    if (!isDragging) return;
    const reset = () => {
      setIsDragging(false);
      dragTabIdRef.current = null;
      dragFolderIdRef.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    document.addEventListener("dragend", reset);
    document.addEventListener("drop", reset);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("dragend", reset);
      document.removeEventListener("drop", reset);
      document.removeEventListener("keydown", onKey);
    };
  }, [isDragging]);

  const handleClearEphemeral = () => {
    if (activeWorkspaceId) {
      window.chiaroscuro.sendCommand(TABS_CLEAR_EPHEMERAL, { workspaceId: activeWorkspaceId });
    }
  };

  // Context menu
  const { open: openContextMenu, portal: contextMenuPortal } = useContextMenu();

  const resize = useSidebarResize(sidebarWidth);

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    // Only fire if right-clicking empty sidebar area (not a tab/folder)
    if ((e.target as HTMLElement).closest("[data-tab-id], [data-folder-id], [data-pinned-tab]")) {
      return;
    }
    openContextMenu(
      [
        {
          label: "Add folder",
          icon: "folder-plus",
          onSelect: () => sendFolderCommand(FOLDERS_CREATE, {}),
        },
      ],
      e,
    );
  };

  const sidebarPx = `${resize.width}px`;

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: visible ? sidebarPx : "0",
        transition: resize.isResizing ? "none" : "width var(--duration-normal) var(--ease-in-out)",
      }}
    >
      <div className="relative flex h-full" style={{ width: sidebarPx }}>
        <nav
          aria-label="Sidebar"
          className="flex flex-col overflow-hidden h-full flex-1"
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => {
            setIsDragging(false);
            dragTabIdRef.current = null;
            dragFolderIdRef.current = null;
          }}
          onContextMenu={handleSidebarContextMenu}
        >
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          {pinnedTabs.length > 0 && (
            <PinnedTabsStrip
              pinnedTabs={pinnedTabs}
              tabs={tabs}
              activeTabId={activeTabId}
              onContextMenu={openContextMenu}
            />
          )}
          {contextMenuPortal}

          <div className="flex-1 overflow-y-auto">
            <div style={{ position: "relative", overflow: "hidden" }}>
              {/* Exiting workspace tabs (slide out) */}
              {wsTransition && prevTabs && (
                <div
                  key={`exit-${wsTransition.fromWorkspaceId}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    willChange: "transform, opacity",
                    animation: `${wsTransition.direction === "right" ? "ws-out-left" : "ws-out-right"} ${WS_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
                  }}
                >
                  <TabSection
                    bookmarked={prevTabs.bookmarked}
                    bookmarkedTree={prevTabs.bookmarkedTree}
                    ephemeral={prevTabs.ephemeral}
                    activeTabId={null}
                    exitingIds={new Set()}
                    dragTabIdRef={dragTabIdRef}
                    dragFolderIdRef={dragFolderIdRef}
                    isDragging={false}
                    onClearEphemeral={() => {}}
                    disableEntryAnimation
                    renamingFolderId={null}
                  />
                </div>
              )}
              {/* Current workspace tabs (slide in) */}
              <div
                key={activeWorkspaceId ?? undefined}
                style={
                  wsTransition
                    ? {
                        willChange: "transform, opacity",
                        animation: `${wsTransition.direction === "right" ? "ws-in-from-right" : "ws-in-from-left"} ${WS_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both`,
                      }
                    : undefined
                }
              >
                <TabSection
                  bookmarked={bookmarked}
                  bookmarkedTree={bookmarkedTree}
                  ephemeral={ephemeral}
                  activeTabId={activeTabId}
                  exitingIds={exitingIds}
                  dragTabIdRef={dragTabIdRef}
                  dragFolderIdRef={dragFolderIdRef}
                  isDragging={isDragging}
                  onClearEphemeral={handleClearEphemeral}
                  disableEntryAnimation={!!wsTransition}
                  renamingFolderId={renamingFolderId}
                  onContextMenu={openContextMenu}
                />
              </div>
            </div>
          </div>

          <DownloadsSection />
          <UpdateNotification />

          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            editorMode={editorMode}
            onEditorModeChange={setEditorMode}
          />
        </nav>
        {/* Invisible resize handle */}
        <div
          className="absolute top-0 right-0 h-full cursor-col-resize"
          style={{ width: "4px" }}
          onPointerDown={resize.handlers.onPointerDown}
          onPointerMove={resize.handlers.onPointerMove}
          onPointerUp={resize.handlers.onPointerUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const delta = e.key === "ArrowRight" ? 10 : -10;
              const width = Math.max(
                MIN_SIDEBAR_WIDTH,
                Math.min(MAX_SIDEBAR_WIDTH, resize.width + delta),
              );
              window.chiaroscuro.sendCommand(APP_STATE_SET_SIDEBAR_WIDTH, {
                width,
              });
            }
          }}
          aria-label="Resize sidebar"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={resize.width}
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

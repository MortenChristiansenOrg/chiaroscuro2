import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ContextMenuItem, useContextMenu } from "../../renderer/src/components/ContextMenu";
import { Icon } from "../../renderer/src/components/Icon";
import type { FolderId, TabId, WorkspaceId } from "../../shared/types";
import {
  APP_STATE_SET_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../app-state/app-state.shared";
// shell-composite: read-only cross-feature store access
import { useAppStateStore } from "../app-state/app-state.store";
import { DownloadsSection } from "../downloads/downloads.renderer";
import type { Folder } from "../folders/folders.shared";
import {
  FOLDERS_CREATE,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_REORDER,
  FOLDERS_TOGGLE_COLLAPSE,
} from "../folders/folders.shared";
// shell-composite: read-only cross-feature store access
import { useFoldersStore } from "../folders/folders.store";
import type { PinnedTabsCommands } from "../pinned-tabs/pinned-tabs.shared";
import { PINNED_TABS_ACTIVATE, PINNED_TABS_TOGGLE_PIN } from "../pinned-tabs/pinned-tabs.shared";
// shell-composite: read-only cross-feature store access
import { usePinnedTabsStore } from "../pinned-tabs/pinned-tabs.store";
import {
  TAB_CUSTOMIZATION_OPEN,
  type TabCustomizationCommands,
} from "../tab-customization/tab-customization.shared";
// shell-composite: read-only cross-feature store access
import { useTabCustomizationStore } from "../tab-customization/tab-customization.store";
import type { Tab, TabsCommands } from "../tabs/tabs.shared";
import {
  TABS_ACTIVATE,
  TABS_CLEAR_EPHEMERAL,
  TABS_CLOSE,
  TABS_REORDER,
  TABS_TOGGLE_BOOKMARK,
} from "../tabs/tabs.shared";
// shell-composite: read-only cross-feature store access
import { useTabsStore } from "../tabs/tabs.store";
import { WorkspaceSwitcher } from "../workspaces/workspaces.renderer";
import type { Workspace } from "../workspaces/workspaces.shared";
// shell-composite: read-only cross-feature store access
import { useWorkspacesStore } from "../workspaces/workspaces.store";
import { useSidebarStore } from "./sidebar.store";

// ── Typed sendCommand ───────────────────────────────────────────

type SidebarUsedCommands = Pick<
  TabsCommands,
  typeof TABS_ACTIVATE | typeof TABS_CLOSE | typeof TABS_CLEAR_EPHEMERAL | typeof TABS_REORDER
> &
  Pick<PinnedTabsCommands, typeof PINNED_TABS_ACTIVATE> &
  Pick<TabCustomizationCommands, typeof TAB_CUSTOMIZATION_OPEN>;

function sendCommand<K extends keyof SidebarUsedCommands>(
  name: K,
  payload: SidebarUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

function sendFolderCommand(name: string, payload: unknown) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Helpers ─────────────────────────────────────────────────────

export function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// ── Tree building ───────────────────────────────────────────────

type TreeItem =
  | { type: "tab"; tab: Tab }
  | { type: "folder"; folder: Folder; children: TreeItem[] };

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

function findFirstTabId(items: TreeItem[]): TabId | null {
  for (const item of items) {
    if (item.type === "tab") return item.tab.id;
    const found = findFirstTabId(item.children);
    if (found) return found;
  }
  return null;
}

function findLastTabId(items: TreeItem[]): TabId | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item) continue;
    if (item.type === "tab") return item.tab.id;
    const found = findLastTabId(item.children);
    if (found) return found;
  }
  return null;
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

// ── Built-in page icons ─────────────────────────────────────────

import type { FaSolidIcon } from "../../shared/fa-icons.generated";

const builtInIcons: Record<string, FaSolidIcon> = {
  "app:settings": "gear",
};

// ── Components ──────────────────────────────────────────────────

function LetterAvatar({ label, hue }: { label: string; hue: number }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-full"
      style={{
        width: 16,
        height: 16,
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        color: "var(--glass-text-primary)",
        background: `oklch(0.55 0.15 ${hue})`,
      }}
    >
      {label}
    </div>
  );
}

export function Favicon({ tab }: { tab: Pick<Tab, "favicon" | "title" | "url"> }) {
  const [imgFailed, setImgFailed] = useState(false);

  const letter = tab.title?.[0]?.toUpperCase() || tab.url?.[0]?.toUpperCase() || "?";
  const hue = hashToHue(tab.url || tab.title);

  if (tab.favicon && !imgFailed) {
    return (
      <img
        src={tab.favicon}
        alt=""
        className="shrink-0 rounded-full"
        style={{ width: 16, height: 16 }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const builtInIcon = builtInIcons[tab.url];
  if (builtInIcon) {
    return (
      <div className="shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }}>
        <Icon name={builtInIcon} css={{ fontSize: 12, color: "var(--glass-text-muted)" }} />
      </div>
    );
  }

  return <LetterAvatar label={letter} hue={hue} />;
}

export function TabItem({
  tab,
  isActive,
  isEphemeral,
  isPinned,
  exiting,
  isBookmarkedSection,
  folderId,
  dragTabIdRef,
  dragFolderIdRef,
  isDragged,
  isDragging,
  onBeforeReorder,
  lastSwapRef,
  lastSwapTimeRef,
  lastFolderSwapRef,
  lastFolderSwapTimeRef,
  disableEntryAnimation,
  onContextMenu,
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
  isPinned?: boolean;
  exiting?: boolean;
  isBookmarkedSection: boolean;
  folderId?: FolderId | null;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef?: React.RefObject<FolderId | null>;
  isDragged: boolean;
  isDragging: boolean;
  onBeforeReorder: () => void;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  lastFolderSwapRef?: React.RefObject<{ targetId: string; position: string } | null>;
  lastFolderSwapTimeRef?: React.RefObject<number>;
  disableEntryAnimation?: boolean;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  const customTitle = useTabCustomizationStore((s) => s.customizations.get(tab.id)?.title);
  const mountedRef = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      mountedRef.current = true;
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const handleClick = () => {
    sendCommand(TABS_ACTIVATE, { tabId: tab.id });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendCommand(TABS_CLOSE, { tabId: tab.id });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    const items: ContextMenuItem[] = [];
    if (isEphemeral) {
      items.push({
        label: "Bookmark",
        icon: "bookmark",
        onSelect: () => sendFolderCommand(TABS_TOGGLE_BOOKMARK, { tabId: tab.id }),
      });
    }
    if (isBookmarkedSection && !isPinned) {
      items.push({
        label: "Remove bookmark",
        icon: "bookmark",
        onSelect: () => sendFolderCommand(TABS_TOGGLE_BOOKMARK, { tabId: tab.id }),
      });
    }
    if (!isPinned) {
      items.push({
        label: "Pin tab",
        icon: "thumbtack",
        onSelect: () => sendFolderCommand(PINNED_TABS_TOGGLE_PIN, { tabId: tab.id }),
      });
    }
    if (isPinned) {
      items.push({
        label: "Unpin tab",
        icon: "thumbtack-slash",
        onSelect: () => sendFolderCommand(PINNED_TABS_TOGGLE_PIN, { tabId: tab.id }),
      });
      items.push({
        label: "Close tab",
        icon: "xmark",
        onSelect: () => sendCommand(TABS_CLOSE, { tabId: tab.id }),
      });
    }
    if (!isEphemeral) {
      items.push({
        label: "Customize tab",
        icon: "sliders",
        onSelect: () => sendCommand(TAB_CUSTOMIZATION_OPEN, { tabId: tab.id }),
      });
    }
    onContextMenu(items, e);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tab.id);
    dragTabIdRef.current = tab.id;
    // Hide browser's default drag ghost
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
    lastSwapRef.current = null;
    lastSwapTimeRef.current = 0;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Handle folder being dragged over this tab
    const draggingFolderId = dragFolderIdRef?.current;
    if (draggingFolderId && isBookmarkedSection) {
      if (
        !lastFolderSwapRef ||
        !lastFolderSwapTimeRef ||
        Date.now() - lastFolderSwapTimeRef.current < 100
      )
        return;
      const rect = elRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = e.clientY > rect.top + rect.height / 2 ? "after" : "before";
      if (
        lastFolderSwapRef.current?.targetId === tab.id &&
        lastFolderSwapRef.current?.position === position
      )
        return;
      lastFolderSwapRef.current = { targetId: tab.id, position };
      lastFolderSwapTimeRef.current = Date.now();
      onBeforeReorder();
      sendFolderCommand(FOLDERS_REORDER, {
        folderId: draggingFolderId,
        parentFolderId: folderId ?? null,
        targetTabId: tab.id,
        position,
      });
      return;
    }

    // Handle tab being dragged over this tab
    const tabId = dragTabIdRef.current;
    if (!tabId || tabId === tab.id) return;
    if (Date.now() - lastSwapTimeRef.current < 100) return;
    const rect = elRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = e.clientY > rect.top + rect.height / 2 ? "after" : "before";
    if (lastSwapRef.current?.targetId === tab.id && lastSwapRef.current?.position === position)
      return;
    lastSwapRef.current = { targetId: tab.id, position };
    lastSwapTimeRef.current = Date.now();
    onBeforeReorder();
    sendCommand(TABS_REORDER, {
      tabId,
      targetBookmarked: isBookmarkedSection,
      targetTabId: tab.id,
      position,
      targetFolderId: folderId ?? null,
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: chrome elements are not keyboard-navigable
    <div
      ref={elRef}
      data-tab-id={tab.id}
      draggable={!exiting}
      className={`${isDragging ? "" : "group"} relative flex items-center cursor-pointer transition-colors duration-150 ${isDragging ? "" : "hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"}`}
      style={{
        gap: "0.625rem",
        padding: "0.375rem 0.75rem",
        margin: "0.25rem 0.375rem",
        borderRadius: "var(--radius-md)",
        background: isDragged
          ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.06)"
          : isActive
            ? "var(--glass-active)"
            : undefined,
        boxShadow: isDragged
          ? "inset 0 0 0 1px oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.25)"
          : isActive
            ? "var(--shadow-subtle)"
            : undefined,
        zIndex: isDragged ? 10 : undefined,
        pointerEvents: exiting ? "none" : undefined,
        animation: exiting
          ? "tab-out 200ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : mountedRef.current || disableEntryAnimation
            ? undefined
            : "tab-in 200ms cubic-bezier(0, 0, 0.2, 1) both",
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Favicon tab={tab} />
      <span
        className={`flex-1 min-w-0 truncate group-hover:text-glass-text-hover group-hover:mr-5 group-active:text-glass-text-pressed ${isActive ? "text-glass-text-primary" : isEphemeral ? "text-glass-text-muted" : "text-glass-text-default"}`}
        style={{
          fontSize: "var(--text-base)",
          fontWeight: isActive ? 500 : undefined,
          transition: "margin var(--duration-fast) var(--ease-in-out)",
        }}
      >
        {customTitle || tab.title || tab.url}
      </span>
      <button
        type="button"
        className="absolute flex opacity-0 group-hover:opacity-100 items-center justify-center bg-transparent text-glass-text-hint transition-[opacity,color] duration-150 hover:text-destructive"
        style={{
          right: "0.375rem",
          top: "50%",
          transform: "translateY(-50%)",
          width: 24,
          height: 24,
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          border: "none",
        }}
        tabIndex={-1}
        onClick={handleClose}
        aria-label="Close tab"
        data-tip="Close tab"
      >
        <Icon name="xmark" css={{ fontSize: 10 }} />
      </button>
    </div>
  );
}

// ── Folder Components ───────────────────────────────────────────

function FolderHeader({
  folder,
  isRenaming,
  isDragging,
  dragTabIdRef,
  dragFolderIdRef,
  depth,
  onBeforeReorder,
  lastFolderSwapRef,
  lastFolderSwapTimeRef,
  lastSwapRef,
  lastSwapTimeRef,
  firstSubtreeTabId,
  lastSubtreeTabId,
  onContextMenu,
}: {
  folder: Folder;
  isRenaming: boolean;
  isDragging: boolean;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  depth: number;
  onBeforeReorder: () => void;
  lastFolderSwapRef: React.RefObject<{ targetId: FolderId; position: string } | null>;
  lastFolderSwapTimeRef: React.RefObject<number>;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  firstSubtreeTabId: TabId | null;
  lastSubtreeTabId: TabId | null;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [dropOver, setDropOver] = useState(false);

  // Reset drop highlight when global drag ends (fallback for lost events)
  useEffect(() => {
    if (!isDragging) setDropOver(false);
  }, [isDragging]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      setRenameValue(folder.name);
    }
  }, [isRenaming, folder.name]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      sendFolderCommand(FOLDERS_RENAME, { folderId: folder.id, name: trimmed });
    }
    useFoldersStore.setState({ renamingFolderId: null });
  };

  const handleHeaderClick = () => {
    if (!isRenaming) {
      sendFolderCommand(FOLDERS_TOGGLE_COLLAPSE, { folderId: folder.id });
    }
  };

  const handleDoubleClick = () => {
    useFoldersStore.setState({ renamingFolderId: folder.id });
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendFolderCommand(FOLDERS_REMOVE, { folderId: folder.id });
  };

  const handleFolderContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    e.stopPropagation();
    onContextMenu(
      [
        {
          label: "Add subfolder",
          icon: "folder-plus",
          onSelect: () => sendFolderCommand(FOLDERS_CREATE, { parentFolderId: folder.id }),
        },
      ],
      e,
    );
  };

  const handleFolderDragStart = (e: React.DragEvent) => {
    if (isRenaming) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-folder", folder.id);
    dragFolderIdRef.current = folder.id;
    // Hide browser's default drag ghost
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
    lastFolderSwapRef.current = null;
    lastFolderSwapTimeRef.current = 0;
  };

  const elRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const draggingFolderId = dragFolderIdRef.current;
    if (draggingFolderId) {
      // Folder-on-folder: reorder as siblings or nest
      if (draggingFolderId === folder.id) return;
      if (Date.now() - lastFolderSwapTimeRef.current < 100) return;
      const rect = elRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relY = (e.clientY - rect.top) / rect.height;
      if (relY > 0.25 && relY < 0.75) {
        // Middle zone: nest into this folder
        setDropOver(true);
        if (
          lastFolderSwapRef.current?.targetId === folder.id &&
          lastFolderSwapRef.current?.position === "inside"
        )
          return;
        lastFolderSwapRef.current = { targetId: folder.id, position: "inside" };
        lastFolderSwapTimeRef.current = Date.now();
        sendFolderCommand(FOLDERS_REORDER, {
          folderId: draggingFolderId,
          parentFolderId: folder.id,
        });
      } else {
        // Top/bottom zone: reorder as sibling
        setDropOver(false);
        const position = relY >= 0.75 ? "after" : "before";
        if (
          lastFolderSwapRef.current?.targetId === folder.id &&
          lastFolderSwapRef.current?.position === position
        )
          return;
        lastFolderSwapRef.current = { targetId: folder.id, position };
        lastFolderSwapTimeRef.current = Date.now();
        sendFolderCommand(FOLDERS_REORDER, {
          folderId: draggingFolderId,
          targetFolderId: folder.id,
          position,
          parentFolderId: folder.parentFolderId,
        });
      }
    } else {
      // Tab being dragged over folder header
      const tabId = dragTabIdRef.current;
      if (!tabId) return;
      const rect = elRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relY = (e.clientY - rect.top) / rect.height;

      if (relY > 0.25 && relY < 0.75) {
        // Middle zone: show drop highlight (nesting happens on drop)
        setDropOver(true);
      } else {
        // Top/bottom zone: live reorder to position adjacent to folder
        setDropOver(false);
        if (Date.now() - lastSwapTimeRef.current < 100) return;

        if (relY <= 0.25 && firstSubtreeTabId) {
          // Before folder
          if (
            lastSwapRef.current?.targetId === firstSubtreeTabId &&
            lastSwapRef.current?.position === "before"
          )
            return;
          lastSwapRef.current = { targetId: firstSubtreeTabId, position: "before" };
          lastSwapTimeRef.current = Date.now();
          onBeforeReorder();
          sendCommand(TABS_REORDER, {
            tabId,
            targetBookmarked: true,
            targetTabId: firstSubtreeTabId,
            position: "before",
            targetFolderId: folder.parentFolderId ?? null,
          });
        } else if (relY >= 0.75 && lastSubtreeTabId) {
          // After folder
          if (
            lastSwapRef.current?.targetId === lastSubtreeTabId &&
            lastSwapRef.current?.position === "after"
          )
            return;
          lastSwapRef.current = { targetId: lastSubtreeTabId, position: "after" };
          lastSwapTimeRef.current = Date.now();
          onBeforeReorder();
          sendCommand(TABS_REORDER, {
            tabId,
            targetBookmarked: true,
            targetTabId: lastSubtreeTabId,
            position: "after",
            targetFolderId: folder.parentFolderId ?? null,
          });
        } else {
          // No subtree tabs — treat as nest zone
          setDropOver(true);
        }
      }
    }
  };

  const handleDragLeave = () => {
    setDropOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    // Tab drop — only nest if in middle zone
    const tabId = dragTabIdRef.current;
    if (tabId) {
      const rect = elRef.current?.getBoundingClientRect();
      if (rect) {
        const relY = (e.clientY - rect.top) / rect.height;
        if (relY > 0.25 && relY < 0.75) {
          onBeforeReorder();
          sendCommand(TABS_REORDER, {
            tabId,
            targetBookmarked: true,
            targetFolderId: folder.id,
          });
        }
        // Top/bottom zones already handled by dragOver live reorder
      }
    }
    // Folder drop handled in dragOver already (live reorder)
  };

  const isDraggedFolder = isDragging && dragFolderIdRef.current === folder.id;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: chrome elements are not keyboard-navigable
    <div
      ref={elRef}
      draggable={!isRenaming}
      className={`${isDragging ? "" : "group"} relative flex items-center cursor-pointer transition-colors duration-150 ${isDragging ? "" : "hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"}`}
      style={{
        gap: "0.625rem",
        padding: "0.375rem 0.75rem",
        paddingLeft: "0.75rem",
        margin: "0.25rem 0.375rem",
        borderRadius: "var(--radius-md)",
        background: dropOver
          ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.1)"
          : isDraggedFolder
            ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.06)"
            : undefined,
        boxShadow: dropOver
          ? "inset 0 0 0 1px oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)"
          : isDraggedFolder
            ? "inset 0 0 0 1px oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.25)"
            : undefined,
        zIndex: isDraggedFolder ? 10 : undefined,
      }}
      onClick={handleHeaderClick}
      onContextMenu={handleFolderContextMenu}
      onDoubleClick={handleDoubleClick}
      onDragStart={handleFolderDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="text-glass-text-default group-hover:text-glass-text-hover group-active:text-glass-text-pressed"
        style={{ position: "relative", width: 16, height: 16, transition: "color 150ms" }}
      >
        <Icon
          name="folder"
          css={{
            fontSize: 14,
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: folder.collapsed ? 1 : 0,
            transform: folder.collapsed ? "scale(1)" : "scale(0.8)",
            transition: "opacity 150ms, transform 150ms",
          }}
        />
        <Icon
          name="folder-open"
          css={{
            fontSize: 14,
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: folder.collapsed ? 0 : 1,
            transform: folder.collapsed ? "scale(0.8)" : "scale(1)",
            transition: "opacity 150ms, transform 150ms",
          }}
        />
      </div>
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              useFoldersStore.setState({ renamingFolderId: null });
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-glass-text-primary outline-none"
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            fontFamily: "inherit",
            border: "none",
            padding: 0,
            margin: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate text-glass-text-default group-hover:text-glass-text-hover group-hover:mr-5 group-active:text-glass-text-pressed"
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            transition: "margin var(--duration-fast) var(--ease-in-out)",
          }}
        >
          {folder.name}
        </span>
      )}
      {!isRenaming && (
        <button
          type="button"
          className="absolute flex opacity-0 group-hover:opacity-100 items-center justify-center bg-transparent text-glass-text-hint transition-[opacity,color] duration-150 hover:text-destructive"
          style={{
            right: "0.375rem",
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            border: "none",
          }}
          tabIndex={-1}
          onClick={handleRemove}
          aria-label="Remove folder"
          data-tip="Remove folder"
        >
          <Icon name="xmark" css={{ fontSize: 10 }} />
        </button>
      )}
    </div>
  );
}

function FolderGroup({
  folder,
  items,
  activeTabId,
  exitingIds,
  dragTabIdRef,
  dragFolderIdRef,
  isDragging,
  onBeforeReorder,
  lastSwapRef,
  lastSwapTimeRef,
  lastFolderSwapRef,
  lastFolderSwapTimeRef,
  disableEntryAnimation,
  renamingFolderId,
  depth,
  onContextMenu,
}: {
  folder: Folder;
  items: TreeItem[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  isDragging: boolean;
  onBeforeReorder: () => void;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  lastFolderSwapRef: React.RefObject<{ targetId: FolderId; position: string } | null>;
  lastFolderSwapTimeRef: React.RefObject<number>;
  disableEntryAnimation?: boolean;
  renamingFolderId: FolderId | null;
  depth: number;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  const firstTab = findFirstTabId(items);
  const lastTab = findLastTabId(items);

  return (
    <div data-folder-id={folder.id}>
      <FolderHeader
        folder={folder}
        isRenaming={renamingFolderId === folder.id}
        isDragging={isDragging}
        dragTabIdRef={dragTabIdRef}
        dragFolderIdRef={dragFolderIdRef}
        depth={depth}
        onBeforeReorder={onBeforeReorder}
        lastFolderSwapRef={lastFolderSwapRef}
        lastFolderSwapTimeRef={lastFolderSwapTimeRef}
        lastSwapRef={lastSwapRef}
        lastSwapTimeRef={lastSwapTimeRef}
        firstSubtreeTabId={firstTab}
        lastSubtreeTabId={lastTab}
        onContextMenu={onContextMenu}
      />
      {!folder.collapsed && (
        <div style={{ paddingLeft: "0.5rem" }}>
          {items.map((item) =>
            item.type === "tab" ? (
              <TabItem
                key={item.tab.id}
                tab={item.tab}
                isActive={item.tab.id === activeTabId}
                isEphemeral={false}
                exiting={exitingIds.has(item.tab.id)}
                isBookmarkedSection={true}
                folderId={folder.id}
                dragTabIdRef={dragTabIdRef}
                dragFolderIdRef={dragFolderIdRef}
                isDragged={item.tab.id === (isDragging ? dragTabIdRef.current : null)}
                isDragging={isDragging}
                onBeforeReorder={onBeforeReorder}
                lastSwapRef={lastSwapRef}
                lastSwapTimeRef={lastSwapTimeRef}
                lastFolderSwapRef={lastFolderSwapRef}
                lastFolderSwapTimeRef={lastFolderSwapTimeRef}
                disableEntryAnimation={disableEntryAnimation}
                onContextMenu={onContextMenu}
              />
            ) : (
              <FolderGroup
                key={item.folder.id}
                folder={item.folder}
                items={item.children}
                activeTabId={activeTabId}
                exitingIds={exitingIds}
                dragTabIdRef={dragTabIdRef}
                dragFolderIdRef={dragFolderIdRef}
                isDragging={isDragging}
                onBeforeReorder={onBeforeReorder}
                lastSwapRef={lastSwapRef}
                lastSwapTimeRef={lastSwapTimeRef}
                lastFolderSwapRef={lastFolderSwapRef}
                lastFolderSwapTimeRef={lastFolderSwapTimeRef}
                disableEntryAnimation={disableEntryAnimation}
                renamingFolderId={renamingFolderId}
                depth={depth + 1}
                onContextMenu={onContextMenu}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function BookmarkedTree({
  tree,
  activeTabId,
  exitingIds,
  dragTabIdRef,
  dragFolderIdRef,
  isDragging,
  onBeforeReorder,
  lastSwapRef,
  lastSwapTimeRef,
  lastFolderSwapRef,
  lastFolderSwapTimeRef,
  disableEntryAnimation,
  renamingFolderId,
  onContextMenu,
}: {
  tree: TreeItem[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  isDragging: boolean;
  onBeforeReorder: () => void;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  lastFolderSwapRef: React.RefObject<{ targetId: FolderId; position: string } | null>;
  lastFolderSwapTimeRef: React.RefObject<number>;
  disableEntryAnimation?: boolean;
  renamingFolderId: FolderId | null;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  return (
    <>
      {tree.map((item) =>
        item.type === "tab" ? (
          <TabItem
            key={item.tab.id}
            tab={item.tab}
            isActive={item.tab.id === activeTabId}
            isEphemeral={false}
            exiting={exitingIds.has(item.tab.id)}
            isBookmarkedSection={true}
            folderId={null}
            dragTabIdRef={dragTabIdRef}
            dragFolderIdRef={dragFolderIdRef}
            isDragged={item.tab.id === (isDragging ? dragTabIdRef.current : null)}
            isDragging={isDragging}
            onBeforeReorder={onBeforeReorder}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            lastFolderSwapRef={lastFolderSwapRef}
            lastFolderSwapTimeRef={lastFolderSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
            onContextMenu={onContextMenu}
          />
        ) : (
          <FolderGroup
            key={item.folder.id}
            folder={item.folder}
            items={item.children}
            activeTabId={activeTabId}
            exitingIds={exitingIds}
            dragTabIdRef={dragTabIdRef}
            dragFolderIdRef={dragFolderIdRef}
            isDragging={isDragging}
            onBeforeReorder={onBeforeReorder}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            lastFolderSwapRef={lastFolderSwapRef}
            lastFolderSwapTimeRef={lastFolderSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
            renamingFolderId={renamingFolderId}
            depth={0}
            onContextMenu={onContextMenu}
          />
        ),
      )}
    </>
  );
}

export function PinnedTabsStrip({
  pinnedTabs,
  tabs,
  activeTabId,
  onContextMenu,
}: {
  pinnedTabs: { id: TabId; url: string; title: string; favicon: string }[];
  tabs: Map<TabId, Tab>;
  activeTabId: TabId | null;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex"
      style={{
        gap: "0.5rem",
        padding: "0 0.375rem 0.25rem",
      }}
    >
      {pinnedTabs.map((pt) => {
        const tab = tabs.get(pt.id);
        const isActive = pt.id === activeTabId;
        return (
          <button
            key={pt.id}
            type="button"
            className={`flex flex-1 items-center justify-center cursor-pointer transition-colors duration-150 ${isActive ? "bg-glass-active" : "bg-glass-subtle hover:bg-glass-hover active:bg-glass-pressed"}`}
            style={{
              height: 32,
              minWidth: 0,
              borderRadius: "var(--radius-md)",
              border: "none",
              boxShadow: isActive ? "var(--shadow-subtle)" : undefined,
            }}
            tabIndex={-1}
            onClick={() => sendCommand(PINNED_TABS_ACTIVATE, { tabId: pt.id })}
            onContextMenu={(e) => {
              if (!onContextMenu) return;
              onContextMenu(
                [
                  {
                    label: "Unpin tab",
                    icon: "thumbtack-slash",
                    onSelect: () => sendFolderCommand(PINNED_TABS_TOGGLE_PIN, { tabId: pt.id }),
                  },
                  {
                    label: "Close tab",
                    icon: "xmark",
                    onSelect: () => sendCommand(TABS_CLOSE, { tabId: pt.id }),
                  },
                  {
                    label: "Customize tab",
                    icon: "sliders",
                    onSelect: () => sendCommand(TAB_CUSTOMIZATION_OPEN, { tabId: pt.id }),
                  },
                ],
                e,
              );
            }}
            data-pinned-tab={pt.id}
            data-tip={pt.title || pt.url}
            aria-label={pt.title || pt.url}
          >
            <Favicon tab={tab ?? pt} />
          </button>
        );
      })}
    </div>
  );
}

function SectionDropZone({
  targetBookmarked,
  dragTabIdRef,
  dragFolderIdRef,
  visible,
  onBeforeReorder,
  targetFolderId,
}: {
  targetBookmarked: boolean;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef?: React.RefObject<FolderId | null>;
  visible: boolean;
  onBeforeReorder?: () => void;
  targetFolderId?: FolderId | null;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      style={{
        height: visible ? (over ? 32 : 24) : 0,
        margin: visible ? "0.25rem 0.375rem" : "0 0.375rem",
        borderRadius: "var(--radius-md)",
        background: over
          ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.1)"
          : "transparent",
        border: over
          ? "1px solid oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)"
          : "1px solid transparent",
        overflow: "hidden",
        transition:
          "height var(--duration-normal) var(--ease-in-out), margin var(--duration-normal) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        // Handle folder drop — move to root level
        if (dragFolderIdRef?.current) {
          const folderId = dragFolderIdRef.current;
          dragFolderIdRef.current = null;
          onBeforeReorder?.();
          sendFolderCommand(FOLDERS_REORDER, {
            folderId,
            parentFolderId: null,
          });
          return;
        }
        // Handle tab drop
        const tabId = dragTabIdRef.current;
        dragTabIdRef.current = null;
        if (!tabId) return;
        onBeforeReorder?.();
        sendCommand(TABS_REORDER, {
          tabId,
          targetBookmarked,
          targetFolderId: targetFolderId ?? null,
        });
      }}
    />
  );
}

function TabSection({
  bookmarked,
  bookmarkedTree,
  ephemeral,
  activeTabId,
  exitingIds,
  dragTabIdRef,
  dragFolderIdRef,
  isDragging,
  onClearEphemeral,
  disableEntryAnimation,
  renamingFolderId,
  onContextMenu,
}: {
  bookmarked: Tab[];
  bookmarkedTree: TreeItem[];
  ephemeral: Tab[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  isDragging: boolean;
  onClearEphemeral: () => void;
  disableEntryAnimation?: boolean;
  renamingFolderId: FolderId | null;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  // Divider visible when ephemeral tabs exist or during drag; lingers for fade-out
  const dividerTarget = ephemeral.length > 0 || isDragging;
  const [showDivider, setShowDivider] = useState(dividerTarget);
  useEffect(() => {
    if (dividerTarget) {
      setShowDivider(true);
      return;
    }
    const t = setTimeout(() => setShowDivider(false), 200); // match --duration-normal
    return () => clearTimeout(t);
  }, [dividerTarget]);

  // ── FLIP animation for smooth tab reordering ──
  const flipContainerRef = useRef<HTMLDivElement>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const snapshotPositions = useCallback(() => {
    const container = flipContainerRef.current;
    if (!container) return;
    const rects = new Map<string, DOMRect>();
    for (const el of container.querySelectorAll<HTMLElement>("[data-tab-id]")) {
      const id = el.dataset.tabId;
      if (id) rects.set(id, el.getBoundingClientRect());
    }
    prevRectsRef.current = rects;
  }, []);

  useLayoutEffect(() => {
    const container = flipContainerRef.current;
    const prev = prevRectsRef.current;
    if (!container || prev.size === 0) return;
    prevRectsRef.current = new Map();

    const elements = container.querySelectorAll<HTMLElement>("[data-tab-id]");
    const toAnimate: { el: HTMLElement; deltaY: number }[] = [];

    for (const el of elements) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const oldRect = prev.get(id);
      if (!oldRect) continue;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) < 1) continue;
      toAnimate.push({ el, deltaY });
    }

    if (toAnimate.length === 0) return;

    for (const { el, deltaY } of toAnimate) {
      el.style.transform = `translateY(${deltaY}px)`;
      el.style.transition = "none";
    }

    void container.offsetHeight;
    requestAnimationFrame(() => {
      for (const { el } of toAnimate) {
        el.style.transition = "transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1)";
        el.style.transform = "";
      }
      setTimeout(() => {
        for (const { el } of toAnimate) {
          el.style.removeProperty("transition");
          el.style.removeProperty("transform");
        }
      }, 210);
    });
  });

  // ── Drag swap tracking ──
  const lastSwapRef = useRef<{ targetId: TabId; position: string } | null>(null);
  const lastSwapTimeRef = useRef(0);
  const lastFolderSwapRef = useRef<{ targetId: FolderId; position: string } | null>(null);
  const lastFolderSwapTimeRef = useRef(0);

  return (
    <div ref={flipContainerRef}>
      {bookmarked.length > 0 || bookmarkedTree.some((item) => item.type === "folder") ? (
        <>
          <BookmarkedTree
            tree={bookmarkedTree}
            activeTabId={activeTabId}
            exitingIds={exitingIds}
            dragTabIdRef={dragTabIdRef}
            dragFolderIdRef={dragFolderIdRef}
            isDragging={isDragging}
            onBeforeReorder={snapshotPositions}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            lastFolderSwapRef={lastFolderSwapRef}
            lastFolderSwapTimeRef={lastFolderSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
            renamingFolderId={renamingFolderId}
            onContextMenu={onContextMenu}
          />
          {/* Root-level drop zone — visible during drag so tabs/folders can be placed outside folders */}
          <SectionDropZone
            targetBookmarked={true}
            dragTabIdRef={dragTabIdRef}
            dragFolderIdRef={dragFolderIdRef}
            visible={isDragging}
            onBeforeReorder={snapshotPositions}
          />
        </>
      ) : (
        <SectionDropZone
          targetBookmarked={true}
          dragTabIdRef={dragTabIdRef}
          dragFolderIdRef={dragFolderIdRef}
          visible={isDragging}
          onBeforeReorder={snapshotPositions}
        />
      )}

      {/* Ephemeral divider — fades in/out based on content or drag state */}
      <div
        className="flex items-center"
        style={{
          gap: "0.5rem",
          padding: showDivider ? "0.375rem 0.5rem 0.25rem 0.875rem" : "0 0.5rem 0 0.875rem",
          margin: "0.125rem 0",
          height: showDivider ? undefined : 0,
          opacity: showDivider ? 1 : 0,
          overflow: "hidden",
          transition:
            "opacity var(--duration-normal) var(--ease-in-out), height var(--duration-normal) var(--ease-in-out), padding var(--duration-normal) var(--ease-in-out)",
        }}
      >
        <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
        {ephemeral.length > 0 && (
          <button
            type="button"
            className="flex items-center cursor-pointer bg-transparent text-glass-text-hint transition-colors duration-150 hover:bg-glass-hover hover:text-glass-text-hover"
            style={{
              gap: "0.25rem",
              border: "none",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              fontFamily: "inherit",
              padding: "0.125rem 0.375rem",
              borderRadius: "var(--radius-sm)",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
            tabIndex={-1}
            onClick={onClearEphemeral}
            data-tip="Clear ephemeral tabs"
          >
            Clear <Icon name="broom" />
          </button>
        )}
      </div>

      {ephemeral.length > 0 ? (
        ephemeral.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isEphemeral={true}
            exiting={exitingIds.has(tab.id)}
            isBookmarkedSection={false}
            dragTabIdRef={dragTabIdRef}
            isDragged={tab.id === (isDragging ? dragTabIdRef.current : null)}
            isDragging={isDragging}
            onBeforeReorder={snapshotPositions}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
            onContextMenu={onContextMenu}
          />
        ))
      ) : (
        <SectionDropZone
          targetBookmarked={false}
          dragTabIdRef={dragTabIdRef}
          visible={isDragging}
          onBeforeReorder={snapshotPositions}
        />
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

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

export function SidebarPanel() {
  const visible = useSidebarStore((s) => s.visible);
  const announcement = useSidebarStore((s) => s.announcement);
  const sidebarWidth = useAppStateStore((s) => s.sidebarWidth);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const pinnedTabs = usePinnedTabsStore((s) => s.pinnedTabs);
  const pinnedTabIds = new Set(pinnedTabs.map((p) => p.id));
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
      sendCommand(TABS_CLEAR_EPHEMERAL, { workspaceId: activeWorkspaceId });
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
          tabIndex={0}
        />
      </div>
    </div>
  );
}

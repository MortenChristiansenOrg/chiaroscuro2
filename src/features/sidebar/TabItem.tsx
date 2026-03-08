import { useEffect, useRef } from "react";
import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import { Icon } from "../../renderer/src/components/Icon";
import type { FolderId, TabId } from "../../shared/types";
import { FOLDERS_REORDER, type FoldersCommands } from "../folders/folders.shared";
import { PINNED_TABS_TOGGLE_PIN, type PinnedTabsCommands } from "../pinned-tabs/pinned-tabs.shared";
import {
  TAB_CUSTOMIZATION_OPEN,
  type TabCustomizationCommands,
} from "../tab-customization/tab-customization.shared";
import { useTabCustomizationStore } from "../tab-customization/tab-customization.store";
import type { Tab, TabsCommands } from "../tabs/tabs.shared";
import {
  TABS_ACTIVATE,
  TABS_CLOSE,
  TABS_NAVIGATE,
  TABS_REORDER,
  TABS_TOGGLE_BOOKMARK,
} from "../tabs/tabs.shared";
import { Favicon } from "./Favicon";
import { useSidebarDrag } from "./SidebarContext";

// ── Typed sendCommand ───────────────────────────────────────────

type TabItemUsedCommands = Pick<
  TabsCommands,
  | typeof TABS_ACTIVATE
  | typeof TABS_CLOSE
  | typeof TABS_NAVIGATE
  | typeof TABS_REORDER
  | typeof TABS_TOGGLE_BOOKMARK
> &
  Pick<TabCustomizationCommands, typeof TAB_CUSTOMIZATION_OPEN> &
  Pick<PinnedTabsCommands, typeof PINNED_TABS_TOGGLE_PIN> &
  Pick<FoldersCommands, typeof FOLDERS_REORDER>;

function sendCommand<K extends keyof TabItemUsedCommands>(
  name: K,
  payload: TabItemUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Component ───────────────────────────────────────────────────

export function TabItem({
  tab,
  isActive,
  isEphemeral,
  isPinned,
  exiting,
  isBookmarkedSection,
  folderId,
  isDragged,
  disableEntryAnimation,
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
  isPinned?: boolean;
  exiting?: boolean;
  isBookmarkedSection: boolean;
  folderId?: FolderId | null;
  isDragged?: boolean;
  disableEntryAnimation?: boolean;
}) {
  const {
    isDragging,
    dragTabIdRef,
    dragFolderIdRef,
    onBeforeReorder,
    lastSwapRef,
    lastSwapTimeRef,
    lastFolderSwapRef,
    lastFolderSwapTimeRef,
    onContextMenu,
  } = useSidebarDrag();
  const customization = useTabCustomizationStore((s) => s.customizations.get(tab.id));
  const customTitle = customization?.title;
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
        onSelect: () => sendCommand(TABS_TOGGLE_BOOKMARK, { tabId: tab.id }),
      });
    }
    if (isBookmarkedSection && !isPinned) {
      items.push({
        label: "Remove bookmark",
        icon: "bookmark",
        onSelect: () => sendCommand(TABS_TOGGLE_BOOKMARK, { tabId: tab.id }),
      });
    }
    if (!isPinned) {
      items.push({
        label: "Pin tab",
        icon: "thumbtack",
        onSelect: () => sendCommand(PINNED_TABS_TOGGLE_PIN, { tabId: tab.id }),
      });
    }
    if (isPinned) {
      items.push({
        label: "Unpin tab",
        icon: "thumbtack-slash",
        onSelect: () => sendCommand(PINNED_TABS_TOGGLE_PIN, { tabId: tab.id }),
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
    const fixedUrl = tab.fixedUrl;
    if (fixedUrl && tab.url !== fixedUrl) {
      items.push({
        label: "Restore original URL",
        icon: "arrow-rotate-left",
        onSelect: () => sendCommand(TABS_NAVIGATE, { tabId: tab.id, url: fixedUrl }),
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
    const draggingFolderId = dragFolderIdRef.current;
    if (draggingFolderId && isBookmarkedSection) {
      if (Date.now() - lastFolderSwapTimeRef.current < 100) return;
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
      sendCommand(FOLDERS_REORDER, {
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
      data-ephemeral={isEphemeral ? "" : undefined}
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
      <div className="shrink-0">
        <Favicon tab={tab} />
      </div>
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

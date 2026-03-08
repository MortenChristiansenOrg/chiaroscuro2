import { useEffect, useRef, useState } from "react";
import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import { Icon } from "../../renderer/src/components/Icon";
import type { FolderId, TabId } from "../../shared/types";
import type { Folder, FoldersCommands } from "../folders/folders.shared";
import {
  FOLDERS_CREATE,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_REORDER,
  FOLDERS_TOGGLE_COLLAPSE,
} from "../folders/folders.shared";
import { useFoldersStore } from "../folders/folders.store";
import type { TabsCommands } from "../tabs/tabs.shared";
import { TABS_REORDER } from "../tabs/tabs.shared";

// ── Typed sendCommand ───────────────────────────────────────────

type FolderHeaderUsedCommands = Pick<TabsCommands, typeof TABS_REORDER> &
  Pick<
    FoldersCommands,
    | typeof FOLDERS_CREATE
    | typeof FOLDERS_REMOVE
    | typeof FOLDERS_RENAME
    | typeof FOLDERS_REORDER
    | typeof FOLDERS_TOGGLE_COLLAPSE
  >;

function sendCommand<K extends keyof FolderHeaderUsedCommands>(
  name: K,
  payload: FolderHeaderUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Component ───────────────────────────────────────────────────

export function FolderHeader({
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
      sendCommand(FOLDERS_RENAME, { folderId: folder.id, name: trimmed });
    }
    useFoldersStore.setState({ renamingFolderId: null });
  };

  const handleHeaderClick = () => {
    if (!isRenaming) {
      sendCommand(FOLDERS_TOGGLE_COLLAPSE, { folderId: folder.id });
    }
  };

  const handleDoubleClick = () => {
    useFoldersStore.setState({ renamingFolderId: folder.id });
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendCommand(FOLDERS_REMOVE, { folderId: folder.id });
  };

  const handleFolderContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    e.stopPropagation();
    onContextMenu(
      [
        {
          label: "Add subfolder",
          icon: "folder-plus",
          onSelect: () => sendCommand(FOLDERS_CREATE, { parentFolderId: folder.id }),
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
        sendCommand(FOLDERS_REORDER, {
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
        sendCommand(FOLDERS_REORDER, {
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
          onBlur={(e) => {
            // Ignore blur from DOM detachment during React re-renders
            if (e.currentTarget.isConnected) commitRename();
          }}
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

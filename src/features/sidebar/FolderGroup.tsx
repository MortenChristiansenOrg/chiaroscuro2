import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import type { FolderId, TabId } from "../../shared/types";
import type { Folder } from "../folders/folders.shared";
import type { Tab } from "../tabs/tabs.shared";
import { FolderHeader } from "./FolderHeader";
import { TabItem } from "./TabItem";
import type { TreeItem } from "./sidebar.renderer";

// ── Helpers ─────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────

export function FolderGroup({
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

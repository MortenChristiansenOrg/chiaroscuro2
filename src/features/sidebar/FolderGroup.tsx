import type { FolderId, TabId } from "../../shared/types";
import type { Folder } from "../folders/folders.shared";
import type { Tab } from "../tabs/tabs.shared";
import { FolderHeader } from "./FolderHeader";
import { useSidebarDrag } from "./SidebarContext";
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
  disableEntryAnimation,
  renamingFolderId,
  depth,
}: {
  folder: Folder;
  items: TreeItem[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  disableEntryAnimation?: boolean;
  renamingFolderId: FolderId | null;
  depth: number;
}) {
  const { isDragging, dragTabIdRef } = useSidebarDrag();
  const firstTab = findFirstTabId(items);
  const lastTab = findLastTabId(items);

  return (
    <div data-folder-id={folder.id}>
      <FolderHeader
        folder={folder}
        isRenaming={renamingFolderId === folder.id}
        depth={depth}
        firstSubtreeTabId={firstTab}
        lastSubtreeTabId={lastTab}
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
                isDragged={item.tab.id === (isDragging ? dragTabIdRef.current : null)}
                disableEntryAnimation={disableEntryAnimation}
              />
            ) : (
              <FolderGroup
                key={item.folder.id}
                folder={item.folder}
                items={item.children}
                activeTabId={activeTabId}
                exitingIds={exitingIds}
                disableEntryAnimation={disableEntryAnimation}
                renamingFolderId={renamingFolderId}
                depth={depth + 1}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

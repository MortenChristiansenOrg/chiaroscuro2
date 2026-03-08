import type { FolderId, TabId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import { FolderGroup } from "./FolderGroup";
import { useSidebarDrag } from "./SidebarContext";
import { TabItem } from "./TabItem";
import type { TreeItem } from "./sidebar.renderer";

export function BookmarkedTree({
  tree,
  activeTabId,
  exitingIds,
  disableEntryAnimation,
  renamingFolderId,
}: {
  tree: TreeItem[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  disableEntryAnimation?: boolean;
  renamingFolderId: FolderId | null;
}) {
  const { isDragging, dragTabIdRef } = useSidebarDrag();
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
            depth={0}
          />
        ),
      )}
    </>
  );
}

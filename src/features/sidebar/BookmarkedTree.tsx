import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import type { FolderId, TabId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import { FolderGroup } from "./FolderGroup";
import { TabItem } from "./TabItem";
import type { TreeItem } from "./sidebar.renderer";

export function BookmarkedTree({
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

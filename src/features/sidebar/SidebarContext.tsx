import { createContext, useContext, useRef } from "react";
import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import type { FolderId, TabId } from "../../shared/types";

export type SidebarDragContextType = {
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  isDragging: boolean;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  lastFolderSwapRef: React.RefObject<{ targetId: FolderId; position: string } | null>;
  lastFolderSwapTimeRef: React.RefObject<number>;
  onBeforeReorderRef: React.RefObject<() => void>;
  onBeforeReorder: () => void;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
};

const SidebarDragContext = createContext<SidebarDragContextType | null>(null);

export function useSidebarDrag(): SidebarDragContextType {
  const ctx = useContext(SidebarDragContext);
  if (!ctx) throw new Error("useSidebarDrag must be used within SidebarDragProvider");
  return ctx;
}

export function SidebarDragProvider({
  isDragging,
  onContextMenu,
  children,
}: {
  isDragging: boolean;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const dragTabIdRef = useRef<TabId | null>(null);
  const dragFolderIdRef = useRef<FolderId | null>(null);
  const lastSwapRef = useRef<{ targetId: TabId; position: string } | null>(null);
  const lastSwapTimeRef = useRef(0);
  const lastFolderSwapRef = useRef<{ targetId: FolderId; position: string } | null>(null);
  const lastFolderSwapTimeRef = useRef(0);
  const onBeforeReorderRef = useRef<() => void>(() => {});

  const value: SidebarDragContextType = {
    dragTabIdRef,
    dragFolderIdRef,
    isDragging,
    lastSwapRef,
    lastSwapTimeRef,
    lastFolderSwapRef,
    lastFolderSwapTimeRef,
    onBeforeReorderRef,
    onBeforeReorder: () => onBeforeReorderRef.current(),
    onContextMenu,
  };

  return <SidebarDragContext.Provider value={value}>{children}</SidebarDragContext.Provider>;
}

import { createContext, useContext, useEffect, useRef } from "react";
import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import type { FolderId, TabId } from "../../shared/types";

export type SidebarDragContextType = {
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef: React.RefObject<FolderId | null>;
  isDragging: boolean;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  lastFolderSwapRef: React.RefObject<{ targetId: FolderId | TabId; position: string } | null>;
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
  onDragEnd,
  onContextMenu,
  children,
}: {
  isDragging: boolean;
  onDragEnd: () => void;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const dragTabIdRef = useRef<TabId | null>(null);
  const dragFolderIdRef = useRef<FolderId | null>(null);
  const lastSwapRef = useRef<{ targetId: TabId; position: string } | null>(null);
  const lastSwapTimeRef = useRef(0);
  const lastFolderSwapRef = useRef<{ targetId: FolderId | TabId; position: string } | null>(null);
  const lastFolderSwapTimeRef = useRef(0);
  const onBeforeReorderRef = useRef<() => void>(() => {});

  // Safety net: when React repositions the drag source DOM node mid-drag
  // (cross-section reorder), Chrome loses track of it and never fires dragend.
  // Listen for drop (which does fire) + dragend + Escape as fallbacks.
  useEffect(() => {
    if (!isDragging) return;
    const reset = () => {
      onDragEnd();
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
  }, [isDragging, onDragEnd]);

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

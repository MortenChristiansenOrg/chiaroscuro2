import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import { Icon } from "../../renderer/src/components/Icon";
import type { FolderId, TabId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import { BookmarkedTree } from "./BookmarkedTree";
import { SectionDropZone } from "./SectionDropZone";
import { TabItem } from "./TabItem";
import type { TreeItem } from "./sidebar.renderer";

export function TabSection({
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

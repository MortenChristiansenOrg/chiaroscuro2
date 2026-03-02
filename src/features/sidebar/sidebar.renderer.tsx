import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import type { TabId, WorkspaceId } from "../../shared/types";
import type { PinnedTabsCommands } from "../pinned-tabs/pinned-tabs.shared";
import { PINNED_TABS_ACTIVATE } from "../pinned-tabs/pinned-tabs.shared";
// shell-composite: read-only cross-feature store access
import { usePinnedTabsStore } from "../pinned-tabs/pinned-tabs.store";
import type { Tab, TabsCommands } from "../tabs/tabs.shared";
import { TABS_ACTIVATE, TABS_CLEAR_EPHEMERAL, TABS_CLOSE, TABS_REORDER } from "../tabs/tabs.shared";
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
  Pick<PinnedTabsCommands, typeof PINNED_TABS_ACTIVATE>;

function sendCommand<K extends keyof SidebarUsedCommands>(
  name: K,
  payload: SidebarUsedCommands[K]["payload"],
) {
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
  exiting,
  isBookmarkedSection,
  dragTabIdRef,
  isDragged,
  isDragging,
  onBeforeReorder,
  lastSwapRef,
  lastSwapTimeRef,
  disableEntryAnimation,
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
  exiting?: boolean;
  isBookmarkedSection: boolean;
  dragTabIdRef: React.RefObject<TabId | null>;
  isDragged: boolean;
  isDragging: boolean;
  onBeforeReorder: () => void;
  lastSwapRef: React.RefObject<{ targetId: TabId; position: string } | null>;
  lastSwapTimeRef: React.RefObject<number>;
  disableEntryAnimation?: boolean;
}) {
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
        {tab.title || tab.url}
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

export function PinnedTabsStrip({
  pinnedTabs,
  tabs,
  activeTabId,
}: {
  pinnedTabs: { id: TabId; url: string; title: string; favicon: string }[];
  tabs: Map<TabId, Tab>;
  activeTabId: TabId | null;
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
  visible,
  onBeforeReorder,
}: {
  targetBookmarked: boolean;
  dragTabIdRef: React.RefObject<TabId | null>;
  visible: boolean;
  onBeforeReorder?: () => void;
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
        const tabId = dragTabIdRef.current;
        dragTabIdRef.current = null;
        if (!tabId) return;
        onBeforeReorder?.();
        sendCommand(TABS_REORDER, { tabId, targetBookmarked });
      }}
    />
  );
}

function TabSection({
  bookmarked,
  ephemeral,
  activeTabId,
  exitingIds,
  dragTabIdRef,
  isDragging,
  onClearEphemeral,
  disableEntryAnimation,
}: {
  bookmarked: Tab[];
  ephemeral: Tab[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  dragTabIdRef: React.RefObject<TabId | null>;
  isDragging: boolean;
  onClearEphemeral: () => void;
  disableEntryAnimation?: boolean;
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
  const draggedTabId = isDragging ? dragTabIdRef.current : null;

  return (
    <div ref={flipContainerRef}>
      {bookmarked.length > 0 ? (
        bookmarked.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isEphemeral={false}
            exiting={exitingIds.has(tab.id)}
            isBookmarkedSection={true}
            dragTabIdRef={dragTabIdRef}
            isDragged={tab.id === draggedTabId}
            isDragging={isDragging}
            onBeforeReorder={snapshotPositions}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
          />
        ))
      ) : (
        <SectionDropZone
          targetBookmarked={true}
          dragTabIdRef={dragTabIdRef}
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
            isDragged={tab.id === draggedTabId}
            isDragging={isDragging}
            onBeforeReorder={snapshotPositions}
            lastSwapRef={lastSwapRef}
            lastSwapTimeRef={lastSwapTimeRef}
            disableEntryAnimation={disableEntryAnimation}
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

export function SidebarPanel() {
  const visible = useSidebarStore((s) => s.visible);
  const announcement = useSidebarStore((s) => s.announcement);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const pinnedTabs = usePinnedTabsStore((s) => s.pinnedTabs);
  const pinnedTabIds = new Set(pinnedTabs.map((p) => p.id));
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

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

  // Previous workspace tabs (for slide-out during transition)
  const prevTabs = useMemo(() => {
    if (!wsTransition) return null;
    const prevAll = [...tabs.values()].filter(
      (t) => t.workspaceId === wsTransition.fromWorkspaceId && !pinnedTabIds.has(t.id),
    );
    return {
      bookmarked: prevAll.filter((t) => t.bookmarked).sort((a, b) => a.order - b.order),
      ephemeral: prevAll.filter((t) => !t.bookmarked).sort((a, b) => a.order - b.order),
    };
  }, [wsTransition, tabs, pinnedTabIds]);

  // Drag & drop
  const dragTabIdRef = useRef<TabId | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Safety net: when React repositions the drag source DOM node mid-drag
  // (cross-section reorder), Chrome loses track of it and never fires dragend.
  // Listen for drop (which does fire) + dragend + Escape as fallbacks.
  useEffect(() => {
    if (!isDragging) return;
    const reset = () => {
      setIsDragging(false);
      dragTabIdRef.current = null;
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

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: visible ? "var(--sidebar-width)" : "0",
        transition: "width var(--duration-normal) var(--ease-in-out)",
      }}
    >
      <nav
        aria-label="Sidebar"
        className="flex flex-col overflow-hidden h-full"
        style={{ width: "var(--sidebar-width)" }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => {
          setIsDragging(false);
          dragTabIdRef.current = null;
        }}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        {pinnedTabs.length > 0 && (
          <PinnedTabsStrip pinnedTabs={pinnedTabs} tabs={tabs} activeTabId={activeTabId} />
        )}

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
                  ephemeral={prevTabs.ephemeral}
                  activeTabId={null}
                  exitingIds={new Set()}
                  dragTabIdRef={dragTabIdRef}
                  isDragging={false}
                  onClearEphemeral={() => {}}
                  disableEntryAnimation
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
                ephemeral={ephemeral}
                activeTabId={activeTabId}
                exitingIds={exitingIds}
                dragTabIdRef={dragTabIdRef}
                isDragging={isDragging}
                onClearEphemeral={handleClearEphemeral}
                disableEntryAnimation={!!wsTransition}
              />
            </div>
          </div>
        </div>

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          editorMode={editorMode}
          onEditorModeChange={setEditorMode}
        />
      </nav>
    </div>
  );
}

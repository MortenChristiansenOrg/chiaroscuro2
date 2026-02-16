import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const prev = prevTabsRef.current;
    const removed: Tab[] = [];
    for (const [id, tab] of prev) {
      if (!tabs.has(id)) removed.push(tab);
    }
    prevTabsRef.current = new Map(tabs);
    if (removed.length === 0) return;
    setExitingTabs(removed);
    const timer = setTimeout(() => setExitingTabs([]), 150);
    return () => clearTimeout(timer);
  }, [tabs]);

  const exitingIds = new Set(exitingTabs.map((t) => t.id));
  return { exitingTabs, exitingIds };
}

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

  return <LetterAvatar label={letter} hue={hue} />;
}

export function TabItem({
  tab,
  isActive,
  isEphemeral,
  exiting,
  index,
  isBookmarkedSection,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
  exiting?: boolean;
  index: number;
  isBookmarkedSection: boolean;
  onDragStart?: (tabId: TabId, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number, bookmarked: boolean) => void;
  onDrop?: (e: React.DragEvent, index: number, bookmarked: boolean) => void;
}) {
  const mountedRef = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);
  const [dropIndicator, setDropIndicator] = useState<"above" | "below" | null>(null);
  useEffect(() => {
    mountedRef.current = true;
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
    onDragStart?.(tab.id, index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = elRef.current?.getBoundingClientRect();
    if (rect) {
      const midY = rect.top + rect.height / 2;
      setDropIndicator(e.clientY < midY ? "above" : "below");
    }
    onDragOver?.(e, index, isBookmarkedSection);
  };

  const handleDragLeave = () => {
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropIndicator(null);
    const rect = elRef.current?.getBoundingClientRect();
    const dropIndex = rect && e.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    onDrop?.(e, dropIndex, isBookmarkedSection);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: chrome elements are not keyboard-navigable
    <div
      ref={elRef}
      draggable={!exiting}
      className="group relative flex items-center cursor-pointer transition-colors hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
      style={{
        gap: "0.625rem",
        padding: "0.375rem 0.75rem",
        margin: "0.25rem 0.375rem",
        borderRadius: "var(--radius-md)",
        background: isActive ? "var(--glass-active)" : undefined,
        boxShadow: isActive
          ? "var(--shadow-subtle)"
          : dropIndicator === "above"
            ? "inset 0 2px 0 0 var(--accent)"
            : dropIndicator === "below"
              ? "inset 0 -2px 0 0 var(--accent)"
              : undefined,
        pointerEvents: exiting ? "none" : undefined,
        animation: exiting
          ? "tab-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : mountedRef.current
            ? undefined
            : "tab-in 200ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
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
        className="absolute flex opacity-0 group-hover:opacity-100 items-center justify-center bg-transparent text-glass-text-hint transition-colors hover:text-destructive"
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
            className={`flex flex-1 items-center justify-center cursor-pointer transition-colors ${isActive ? "" : "bg-glass-subtle hover:bg-glass-hover active:bg-glass-pressed"}`}
            style={{
              height: 32,
              minWidth: 0,
              borderRadius: "var(--radius-md)",
              border: "none",
              background: isActive ? "var(--glass-active)" : undefined,
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

function TabSection({
  bookmarked,
  ephemeral,
  activeTabId,
  exitingIds,
  onDragStart,
  onDragOver,
  onDrop,
  onClearEphemeral,
}: {
  bookmarked: Tab[];
  ephemeral: Tab[];
  activeTabId: TabId | null;
  exitingIds: Set<TabId>;
  onDragStart: (tabId: TabId, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number, bookmarked: boolean) => void;
  onDrop: (e: React.DragEvent, index: number, bookmarked: boolean) => void;
  onClearEphemeral: () => void;
}) {
  return (
    <div>
      {bookmarked.length > 0 &&
        bookmarked.map((tab, i) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isEphemeral={false}
            exiting={exitingIds.has(tab.id)}
            index={i}
            isBookmarkedSection={true}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))}

      {ephemeral.length > 0 && (
        <>
          <div
            className="flex items-center"
            style={{
              gap: "0.5rem",
              padding: "0.375rem 0.5rem 0.25rem 0.875rem",
              margin: "0.125rem 0",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
            <button
              type="button"
              className="flex items-center cursor-pointer bg-transparent text-glass-text-hint transition-colors hover:bg-glass-hover hover:text-glass-text-hover"
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
          </div>
          {ephemeral.map((tab, i) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEphemeral={true}
              exiting={exitingIds.has(tab.id)}
              index={i}
              isBookmarkedSection={false}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </>
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
  ];
  const ephemeral = [
    ...all.filter((t) => !t.bookmarked),
    ...exitingInWorkspace.filter((t) => !t.bookmarked),
  ];
  // Drag & drop
  const dragTabIdRef = useRef<TabId | null>(null);

  const handleDragStart = (tabId: TabId, _index: number) => {
    dragTabIdRef.current = tabId;
  };

  const handleDragOver = (_e: React.DragEvent, _index: number, _bookmarked: boolean) => {
    // Just allow drop — visual indicator is handled per-item
  };

  const handleDrop = (_e: React.DragEvent, targetIndex: number, targetBookmarked: boolean) => {
    const tabId = dragTabIdRef.current;
    dragTabIdRef.current = null;
    if (!tabId) return;
    sendCommand(TABS_REORDER, { tabId, targetIndex, targetBookmarked });
  };

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
        className="flex flex-col overflow-y-auto h-full"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        {pinnedTabs.length > 0 && (
          <PinnedTabsStrip pinnedTabs={pinnedTabs} tabs={tabs} activeTabId={activeTabId} />
        )}

        <TabSection
          bookmarked={bookmarked}
          ephemeral={ephemeral}
          activeTabId={activeTabId}
          exitingIds={exitingIds}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClearEphemeral={handleClearEphemeral}
        />

        <div className="flex-1" />

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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TabId, WorkspaceId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import { useTabsStore } from "../tabs/tabs.store";
import { useWorkspacesStore } from "../workspaces/workspaces.store";
import { useSidebarStore } from "./sidebar.store";

function sendCommand(name: string, payload: unknown) {
  window.chiaroscuro.sendCommand(name, payload);
}

function Favicon({ tab }: { tab: Tab }) {
  if (tab.favicon) {
    return (
      <img
        src={tab.favicon}
        alt=""
        className="shrink-0 rounded-full"
        style={{ width: 16, height: 16 }}
      />
    );
  }

  // Fallback: colored circle with letter
  const letter = tab.title?.[0]?.toUpperCase() || tab.url?.[0]?.toUpperCase() || "?";
  const hue = hashToHue(tab.url || tab.title);

  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-full"
      style={{
        width: 16,
        height: 16,
        fontSize: 8,
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        color: "oklch(1 0 0)",
        background: `oklch(0.55 0.15 ${hue})`,
      }}
    >
      {letter}
    </div>
  );
}

function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function TabItem({
  tab,
  isActive,
  isEphemeral,
  exiting,
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
  exiting?: boolean;
}) {
  const handleClick = useCallback(() => {
    sendCommand("tabs:activate", { tabId: tab.id });
  }, [tab.id]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      sendCommand("tabs:close", { tabId: tab.id });
    },
    [tab.id],
  );

  return (
    <div
      className="group flex items-center cursor-pointer transition-all focus-ring hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
      style={{
        gap: 10,
        padding: "0.375rem 0.75rem",
        margin: "2px 0.375rem",
        borderRadius: "var(--radius-md)",
        background: isActive ? "var(--glass-active)" : undefined,
        boxShadow: isActive ? "var(--shadow-subtle)" : undefined,
        pointerEvents: exiting ? "none" : undefined,
        animation: exiting
          ? "tab-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : "tab-in 200ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      // biome-ignore lint/a11y/useSemanticElements: tab item is not a semantic button
      role="button"
      tabIndex={0}
    >
      <Favicon tab={tab} />
      <span
        className={`flex-1 min-w-0 truncate group-hover:text-glass-text-hover group-active:text-glass-text-pressed ${isActive ? "text-glass-text-primary" : isEphemeral ? "text-glass-text-muted" : "text-glass-text-default"}`}
        style={{
          fontSize: "var(--text-base)",
          fontWeight: isActive ? 500 : undefined,
        }}
      >
        {tab.title || tab.url}
      </span>
      <button
        type="button"
        className="flex opacity-0 group-hover:opacity-100 items-center justify-center shrink-0 bg-transparent text-glass-text-hint transition-all focus-ring hover:text-glass-text-hover"
        style={{
          width: 20,
          height: 20,
          borderRadius: "var(--radius-sm)",
          marginLeft: "auto",
          cursor: "pointer",
          border: "none",
        }}
        onClick={handleClose}
        aria-label="Close tab"
        data-tip="Close tab"
      >
        <i className="fa-solid fa-xmark" style={{ fontSize: 10 }} />
      </button>
    </div>
  );
}

function WorkspaceBubble({
  workspace,
  isActive,
}: {
  workspace: { id: WorkspaceId; name: string; color: string; initial: string };
  isActive: boolean;
}) {
  const handleClick = useCallback(() => {
    sendCommand("workspaces:switch", { workspaceId: workspace.id });
  }, [workspace.id]);

  // Build the ring shadow using oklch with proper syntax
  const activeRing = workspace.color.startsWith("oklch(")
    ? `0 0 0 2px oklch(${workspace.color.slice(5, -1)} / 0.4)`
    : `0 0 0 2px ${workspace.color}66`;

  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="flex items-center justify-center cursor-pointer focus-ring"
      style={{
        width: 24,
        height: 24,
        borderRadius: "var(--radius-full)",
        border: "none",
        fontSize: 10,
        fontWeight: 600,
        background: workspace.color,
        color: "oklch(1 0 0)",
        transform: isActive ? "scale(1.08)" : hovered ? "scale(1.12)" : undefined,
        boxShadow: isActive ? activeRing : undefined,
        transition: "transform var(--duration-normal) var(--ease-in-out)",
      }}
      onClick={handleClick}
      data-tip={workspace.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {workspace.initial}
    </button>
  );
}

export function SidebarPanel() {
  const visible = useSidebarStore((s) => s.visible);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  // Track exiting tabs for exit animation
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

  const { bookmarked, ephemeral } = useMemo(() => {
    const all = [...tabs.values()].filter((t) => t.workspaceId === activeWorkspaceId);
    const exitingInWorkspace = exitingTabs.filter((t) => t.workspaceId === activeWorkspaceId);
    return {
      bookmarked: [
        ...all.filter((t) => t.bookmarked),
        ...exitingInWorkspace.filter((t) => t.bookmarked),
      ],
      ephemeral: [
        ...all.filter((t) => !t.bookmarked),
        ...exitingInWorkspace.filter((t) => !t.bookmarked),
      ],
    };
  }, [tabs, activeWorkspaceId, exitingTabs]);

  const handleClearEphemeral = useCallback(() => {
    if (activeWorkspaceId) {
      sendCommand("tabs:clear-ephemeral", { workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId]);

  const exitingIds = useMemo(() => new Set(exitingTabs.map((t) => t.id)), [exitingTabs]);

  if (!visible) return null;

  return (
    <div
      className="flex flex-col overflow-y-auto shrink-0"
      style={{ width: "var(--sidebar-width)", padding: "5px 0 0" }}
    >
      {/* Bookmarked section */}
      {bookmarked.length > 0 && (
        <>
          <div
            style={{
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--glass-text-muted)",
              padding: "10px 14px 3px",
              fontWeight: 500,
            }}
          >
            Bookmarked
          </div>
          {bookmarked.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEphemeral={false}
              exiting={exitingIds.has(tab.id)}
            />
          ))}
        </>
      )}

      {/* Ephemeral divider */}
      {ephemeral.length > 0 && (
        <>
          <div
            className="flex items-center"
            style={{ gap: 8, padding: "6px 8px 4px 14px", margin: "2px 0" }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
            <button
              type="button"
              className="flex items-center cursor-pointer bg-transparent text-glass-text-hint transition-all focus-ring hover:bg-glass-hover hover:text-glass-text-hover"
              style={{
                gap: 4,
                border: "none",
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                fontFamily: "inherit",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                whiteSpace: "nowrap",
                letterSpacing: "0.02em",
              }}
              onClick={handleClearEphemeral}
              data-tip="Clear ephemeral tabs"
            >
              Clear
            </button>
          </div>
          {ephemeral.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEphemeral={true}
              exiting={exitingIds.has(tab.id)}
            />
          ))}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Workspace bar */}
      <div className="flex items-center" style={{ gap: "0.375rem", padding: "10px 12px" }}>
        <div className="flex" style={{ gap: "0.375rem" }}>
          {workspaces.map((ws) => (
            <WorkspaceBubble key={ws.id} workspace={ws} isActive={ws.id === activeWorkspaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}

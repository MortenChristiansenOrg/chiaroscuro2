import { useCallback, useMemo } from "react";
import type { TabId, WorkspaceId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import { useTabsStore } from "../tabs/tabs.store";
import { useWorkspacesStore } from "../workspaces/workspaces.store";
import { useSidebarStore } from "./sidebar.store";

function sendCommand(name: string, payload: unknown) {
  window.chiaroscuro.sendCommand(name, payload);
}

function CloseIconSmall() {
  return (
    <svg
      aria-hidden="true"
      width="7"
      height="7"
      viewBox="0 0 7 7"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <line x1="0" y1="0" x2="7" y2="7" />
      <line x1="7" y1="0" x2="0" y2="7" />
    </svg>
  );
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
      className="shrink-0 flex items-center justify-center rounded-full text-white"
      style={{
        width: 16,
        height: 16,
        fontSize: 8,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
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
}: {
  tab: Tab;
  isActive: boolean;
  isEphemeral: boolean;
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
      className="group flex items-center cursor-pointer transition-all"
      style={{
        gap: 10,
        padding: "5px 12px",
        margin: "1px 6px",
        borderRadius: "var(--radius-pill)",
        background: isActive ? "var(--glass-active)" : undefined,
        boxShadow: isActive ? "var(--shadow-subtle)" : undefined,
      }}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      // biome-ignore lint/a11y/useSemanticElements: tab item is not a semantic button
      role="button"
      tabIndex={0}
    >
      <Favicon tab={tab} />
      <span
        className="flex-1 min-w-0 truncate"
        style={{
          fontSize: "12.5px",
          color: isActive
            ? "var(--glass-text-primary)"
            : isEphemeral
              ? "oklch(1 0 0 / 0.35)"
              : "var(--glass-text-default)",
          fontWeight: isActive ? 500 : undefined,
        }}
      >
        {tab.title || tab.url}
      </span>
      <button
        type="button"
        className="hidden group-hover:flex items-center justify-center shrink-0 transition-all"
        style={{
          width: 16,
          height: 16,
          borderRadius: "var(--radius-sm)",
          color: "var(--glass-text-hint)",
          marginLeft: "auto",
        }}
        onClick={handleClose}
        aria-label="Close tab"
      >
        <CloseIconSmall />
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

  return (
    <button
      type="button"
      className="flex items-center justify-center cursor-pointer transition-all"
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: "none",
        fontSize: 10,
        fontWeight: 600,
        background: workspace.color,
        color: "#fff",
        transform: isActive ? "scale(1.08)" : undefined,
        boxShadow: isActive ? `0 0 0 2px ${workspace.color.replace(")", " / 0.4)")}` : undefined,
      }}
      onClick={handleClick}
      data-tip={workspace.name}
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

  const { bookmarked, ephemeral } = useMemo(() => {
    const all = [...tabs.values()].filter((t) => t.workspaceId === activeWorkspaceId);
    return {
      bookmarked: all.filter((t) => t.bookmarked),
      ephemeral: all.filter((t) => !t.bookmarked),
    };
  }, [tabs, activeWorkspaceId]);

  const handleClearEphemeral = useCallback(() => {
    if (activeWorkspaceId) {
      sendCommand("tabs:clear-ephemeral", { workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId]);

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
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--glass-text-hint)",
              padding: "10px 14px 3px",
              fontWeight: 500,
            }}
          >
            Bookmarked
          </div>
          {bookmarked.map((tab) => (
            <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} isEphemeral={false} />
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
              className="flex items-center cursor-pointer transition-all"
              style={{
                gap: 4,
                border: "none",
                background: "none",
                color: "var(--glass-text-hint)",
                fontSize: 9,
                fontWeight: 500,
                fontFamily: "inherit",
                padding: "2px 6px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                letterSpacing: "0.02em",
              }}
              onClick={handleClearEphemeral}
            >
              Clear
            </button>
          </div>
          {ephemeral.map((tab) => (
            <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} isEphemeral={true} />
          ))}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Workspace bar */}
      <div className="flex items-center" style={{ gap: 6, padding: "10px 12px" }}>
        <div className="flex" style={{ gap: 6 }}>
          {workspaces.map((ws) => (
            <WorkspaceBubble key={ws.id} workspace={ws} isActive={ws.id === activeWorkspaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}

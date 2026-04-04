import { useEffect, useRef, useState } from "react";
import { useContextMenu } from "../../renderer/src/components/ContextMenu";
import { Icon } from "../../renderer/src/components/Icon";
import { FA_SOLID_SEARCH } from "../../shared/fa-icon-search.generated";
import type { FaSolidIcon } from "../../shared/fa-icons.generated";
import type { WorkspaceId } from "../../shared/types";
import {
  WORKSPACES_CREATE,
  WORKSPACES_DELETE,
  WORKSPACES_SWITCH,
  WORKSPACES_UPDATE,
  type Workspace,
  type WorkspacesCommands,
} from "./workspaces.shared";

// ── Typed sendCommand ───────────────────────────────────────────

type WorkspacesUsedCommands = Pick<
  WorkspacesCommands,
  | typeof WORKSPACES_SWITCH
  | typeof WORKSPACES_CREATE
  | typeof WORKSPACES_UPDATE
  | typeof WORKSPACES_DELETE
>;

function sendCommand<K extends keyof WorkspacesUsedCommands>(
  name: K,
  payload: WorkspacesUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── FA icon helpers ─────────────────────────────────────────────

function isFaIcon(icon: string): boolean {
  return icon.startsWith("fa:");
}

function faIconName(icon: string): FaSolidIcon {
  return icon.slice(3) as FaSolidIcon;
}

// ── Components ──────────────────────────────────────────────────

export function WorkspaceBubble({
  workspace,
  isActive,
  onEdit,
  onContextMenu,
}: {
  workspace: { id: WorkspaceId; name: string; color: string; icon: string };
  isActive: boolean;
  onEdit?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const handleClick = () => {
    sendCommand(WORKSPACES_SWITCH, { workspaceId: workspace.id });
  };

  const hasFaIcon = isFaIcon(workspace.icon);
  const [hovered, setHovered] = useState(false);

  const scale = hovered ? 1.2 : isActive ? 1.1 : 0.75;

  return (
    <button
      type="button"
      className="flex items-center justify-center cursor-pointer"
      aria-label={workspace.name}
      aria-current={isActive ? "true" : undefined}
      data-workspace-id={workspace.id}
      tabIndex={-1}
      style={{
        width: 32,
        height: 32,
        border: "none",
        fontSize: hasFaIcon ? 16 : "var(--text-sm)",
        fontWeight: hasFaIcon ? undefined : 600,
        background: "transparent",
        color: "var(--glass-text-primary)",
        opacity: isActive || hovered ? 1 : 0.7,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
        transform: `scale(${scale})`,
        transition: "all var(--duration-normal) var(--ease-in-out)",
      }}
      onClick={handleClick}
      onDoubleClick={onEdit}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-tip={workspace.name}
    >
      {hasFaIcon ? <Icon name={faIconName(workspace.icon)} /> : workspace.icon}
    </button>
  );
}

export const WORKSPACE_COLORS = [
  "oklch(0.6 0.15 20)",
  "oklch(0.6 0.15 50)",
  "oklch(0.6 0.12 80)",
  "oklch(0.6 0.15 110)",
  "oklch(0.6 0.15 140)",
  "oklch(0.6 0.12 180)",
  "oklch(0.6 0.12 205)",
  "oklch(0.6 0.12 230)",
  "oklch(0.6 0.15 255)",
  "oklch(0.6 0.15 280)",
  "oklch(0.6 0.15 315)",
  "oklch(0.6 0.15 350)",
];

// ── Icon search ─────────────────────────────────────────────────

function searchIcons(query: string): FaSolidIcon[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const results: FaSolidIcon[] = [];
  for (const [name, text] of FA_SOLID_SEARCH) {
    if (text.includes(q)) {
      results.push(name as FaSolidIcon);
      if (results.length >= 18) break;
    }
  }
  return results;
}

// ── Workspace editor ────────────────────────────────────────────

export function WorkspaceEditor({
  workspace,
  onClose,
}: {
  workspace?: { id: WorkspaceId; name: string; color: string; icon: string; privacyMode: boolean };
  onClose: () => void;
}) {
  const isNew = !workspace;
  const existingFaIcon =
    workspace?.icon && isFaIcon(workspace.icon) ? faIconName(workspace.icon) : null;

  const [name, setName] = useState(workspace?.name ?? "");
  const [textIcon, setTextIcon] = useState(existingFaIcon ? "" : (workspace?.icon ?? ""));
  const [iconCustomized, setIconCustomized] = useState(false);
  const [selectedFaIcon, setSelectedFaIcon] = useState<FaSolidIcon | null>(existingFaIcon);
  const [iconQuery, setIconQuery] = useState("");
  const [color, setColor] = useState(workspace?.color ?? (WORKSPACE_COLORS[0] as string));
  const [privacyMode, setPrivacyMode] = useState(workspace?.privacyMode ?? false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-derive text icon from name unless customized
  const displayTextIcon = iconCustomized ? textIcon : name[0]?.toUpperCase() || "";

  // Resolved icon value for submission
  const resolvedIcon = selectedFaIcon ? `fa:${selectedFaIcon}` : displayTextIcon.trim() || "?";

  // Search results
  const iconResults = searchIcons(iconQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isNew) {
      sendCommand(WORKSPACES_CREATE, {
        name: name.trim(),
        color,
        icon: resolvedIcon,
        privacyMode,
      });
    } else {
      sendCommand(WORKSPACES_UPDATE, {
        workspaceId: workspace.id,
        changes: { name: name.trim(), color, icon: resolvedIcon, privacyMode },
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!workspace) return;
    if (!window.confirm(`Delete workspace "${workspace.name}"?`)) return;
    sendCommand(WORKSPACES_DELETE, { workspaceId: workspace.id });
    onClose();
  };

  const handleSelectFaIcon = (iconName: FaSolidIcon) => {
    setSelectedFaIcon(iconName);
    setIconQuery("");
  };

  const handleClearFaIcon = () => {
    setSelectedFaIcon(null);
    setIconCustomized(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="flex flex-col"
      style={{
        gap: "0.5rem",
        padding: "0.5rem 0.75rem",
        borderTop: "1px solid var(--glass-border)",
      }}
    >
      {/* Row 1: Icon preview + Name */}
      <div className="flex items-center" style={{ gap: "0.375rem" }}>
        {selectedFaIcon ? (
          <button
            type="button"
            onClick={handleClearFaIcon}
            className="flex items-center justify-center cursor-pointer"
            title="Clear icon"
            style={{
              width: 28,
              height: 28,
              background: "transparent",
              color: "var(--glass-text-primary)",
              fontSize: 14,
              border: "none",
              flexShrink: 0,
            }}
          >
            <Icon name={selectedFaIcon} />
          </button>
        ) : (
          <input
            type="text"
            value={displayTextIcon}
            onChange={(e) => {
              setTextIcon(e.target.value.slice(0, 2));
              setIconCustomized(true);
            }}
            placeholder="?"
            className="outline-none text-center"
            style={{
              width: 28,
              height: 28,
              background: "transparent",
              color: "var(--glass-text-primary)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              border: "none",
              fontFamily: "inherit",
            }}
          />
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name"
          // biome-ignore lint/a11y/noAutofocus: editor should focus name field
          autoFocus
          className="flex-1 min-w-0 outline-none placeholder:text-glass-text-hint"
          style={{
            background: "transparent",
            color: "var(--glass-text-primary)",
            fontSize: "var(--text-sm)",
            border: "none",
            padding: "0.25rem 0",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Row 2: Icon search */}
      <div className="flex flex-col" style={{ gap: "0.375rem" }}>
        <div
          className="flex items-center"
          style={{
            gap: "0.375rem",
            padding: "0.25rem 0.375rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--glass-subtle)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <Icon
            name="magnifying-glass"
            css={{
              fontSize: 10,
              color: "var(--glass-text-hint)",
              flexShrink: 0,
            }}
          />
          <input
            ref={searchRef}
            type="text"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
            placeholder="Search icons..."
            className="flex-1 min-w-0 outline-none placeholder:text-glass-text-hint"
            style={{
              background: "transparent",
              color: "var(--glass-text-primary)",
              fontSize: "var(--text-xs)",
              border: "none",
              padding: 0,
              fontFamily: "inherit",
            }}
          />
          {selectedFaIcon && !iconQuery && (
            <span
              className="flex items-center"
              style={{
                gap: "0.25rem",
                fontSize: "var(--text-xs)",
                color: "var(--glass-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name={selectedFaIcon} css={{ fontSize: 10 }} />
              {selectedFaIcon}
            </span>
          )}
        </div>

        {/* Icon search results grid */}
        {iconResults.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: "0.25rem" }}>
            {iconResults.map((iconName) => (
              <button
                key={iconName}
                type="button"
                onClick={() => handleSelectFaIcon(iconName)}
                className="flex items-center justify-center cursor-pointer"
                title={iconName}
                data-tip={iconName}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "var(--radius-sm)",
                  border:
                    iconName === selectedFaIcon
                      ? `1.5px solid ${color}`
                      : "1.5px solid transparent",
                  background:
                    iconName === selectedFaIcon
                      ? `oklch(${color.slice(6, -1)} / 0.15)`
                      : "var(--glass-subtle)",
                  color: iconName === selectedFaIcon ? color : "var(--glass-text-default)",
                  fontSize: 13,
                  transition: "all 120ms ease",
                }}
              >
                <Icon name={iconName} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: Privacy mode */}
      <label
        className="flex items-center cursor-pointer"
        style={{
          gap: "0.375rem",
          fontSize: "var(--text-xs)",
          color: "var(--glass-text-muted)",
        }}
      >
        <input
          type="checkbox"
          checked={privacyMode}
          onChange={(e) => setPrivacyMode(e.target.checked)}
          style={{ accentColor: color }}
        />
        Privacy mode
      </label>

      {/* Row 5: Action buttons */}
      <div className="flex items-center" style={{ gap: "0.375rem" }}>
        <button
          type="submit"
          className="cursor-pointer text-glass-text-primary hover:bg-glass-hover"
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-subtle)",
            fontFamily: "inherit",
          }}
        >
          {isNew ? "Add" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-glass-text-muted hover:text-glass-text-default"
          style={{
            fontSize: "var(--text-xs)",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: "transparent",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            className="cursor-pointer text-glass-text-muted hover:text-destructive"
            style={{
              fontSize: "var(--text-xs)",
              padding: "0.25rem 0.5rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "transparent",
              fontFamily: "inherit",
              marginLeft: "auto",
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

/** Fades children in/out, unmounting after exit transition. */
function FadePresence({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(visible);
  const [show, setShow] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const outer = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setShow(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(rafRef.current);
      };
    }
    setShow(false);
    // Immediately unmount under reduced motion (no transition fires)
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setMounted(false);
    }
    return undefined;
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transition: "opacity var(--duration-normal) var(--ease-in-out)",
      }}
      onTransitionEnd={(e) => {
        // Only unmount on our own opacity transition, not descendant bubbles
        if (e.target !== e.currentTarget || e.propertyName !== "opacity" || visible) return;
        setMounted(false);
      }}
    >
      {children}
    </div>
  );
}

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: WorkspaceId | null;
  editorMode: "none" | "new" | WorkspaceId;
  onEditorModeChange: (mode: "none" | "new" | WorkspaceId) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  editorMode,
  onEditorModeChange,
}: WorkspaceSwitcherProps) {
  const { open: openContextMenu } = useContextMenu();

  const handleBubbleContextMenu = (ws: Workspace, e: React.MouseEvent) => {
    openContextMenu(
      [
        {
          label: "Edit workspace",
          icon: "pencil",
          onSelect: () => onEditorModeChange(ws.id),
        },
        {
          label: "Add workspace",
          icon: "plus",
          onSelect: () => onEditorModeChange("new"),
        },
      ],
      e,
    );
  };

  const handleSwitcherContextMenu = (e: React.MouseEvent) => {
    // Only on empty area, not on a workspace bubble
    if ((e.target as HTMLElement).closest("[data-workspace-id]")) return;
    openContextMenu(
      [
        {
          label: "Add workspace",
          icon: "plus",
          onSelect: () => onEditorModeChange("new"),
        },
      ],
      e,
    );
  };

  return (
    <>
      {/* Workspace editor */}
      <FadePresence visible={editorMode !== "none"}>
        <WorkspaceEditor
          workspace={editorMode !== "new" ? workspaces.find((w) => w.id === editorMode) : undefined}
          onClose={() => onEditorModeChange("none")}
        />
      </FadePresence>

      <div
        className="flex items-center justify-center"
        data-testid="workspace-switcher"
        style={{ padding: "0.625rem 0.75rem" }}
        onContextMenu={handleSwitcherContextMenu}
      >
        <div className="flex items-center flex-wrap justify-center">
          {workspaces.map((ws, i) => {
            const isActive = ws.id === activeWorkspaceId;
            const prevActive = i > 0 && workspaces[i - 1]?.id === activeWorkspaceId;
            const gap = i === 0 ? 0 : isActive || prevActive ? "0.125rem" : "0.0625rem";
            return (
              <div
                key={ws.id}
                style={{
                  marginLeft: gap,
                  transition: "margin var(--duration-normal) var(--ease-in-out)",
                }}
              >
                <WorkspaceBubble
                  workspace={ws}
                  isActive={isActive}
                  onEdit={() => onEditorModeChange(ws.id)}
                  onContextMenu={(e) => handleBubbleContextMenu(ws, e)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
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

// ── Components ──────────────────────────────────────────────────

export function WorkspaceBubble({
  workspace,
  isActive,
  focused,
  onEdit,
}: {
  workspace: { id: WorkspaceId; name: string; color: string; icon: string };
  isActive: boolean;
  focused?: boolean;
  onEdit?: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focused) btnRef.current?.focus();
  }, [focused]);

  const handleClick = () => {
    sendCommand(WORKSPACES_SWITCH, { workspaceId: workspace.id });
  };

  // Build the ring shadow using oklch with proper syntax
  const activeRing = workspace.color.startsWith("oklch(")
    ? `0 0 0 2px oklch(${workspace.color.slice(5, -1)} / 0.4)`
    : `0 0 0 2px ${workspace.color}66`;

  return (
    <button
      ref={btnRef}
      type="button"
      className="flex items-center justify-center cursor-pointer focus-ring"
      aria-label={workspace.name}
      aria-current={isActive ? "true" : undefined}
      tabIndex={focused ? 0 : -1}
      style={{
        width: 32,
        height: 32,
        borderRadius: "var(--radius-full)",
        border: "none",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        background: workspace.color,
        color: "var(--glass-text-primary)",
        boxShadow: isActive ? activeRing : undefined,
        transform: isActive ? "scale(1)" : "scale(0.75)",
        transition: "all var(--duration-normal) var(--ease-in-out)",
      }}
      onClick={handleClick}
      onDoubleClick={onEdit}
      data-tip={workspace.name}
    >
      {workspace.icon}
    </button>
  );
}

export const WORKSPACE_COLORS = [
  "oklch(0.6 0.12 230)",
  "oklch(0.6 0.15 350)",
  "oklch(0.6 0.15 140)",
  "oklch(0.6 0.15 50)",
  "oklch(0.6 0.15 280)",
  "oklch(0.6 0.12 180)",
];

export function WorkspaceEditor({
  workspace,
  onClose,
}: {
  workspace?: { id: WorkspaceId; name: string; color: string; icon: string };
  onClose: () => void;
}) {
  const isNew = !workspace;
  const [name, setName] = useState(workspace?.name ?? "");
  const [icon, setIcon] = useState(workspace?.icon ?? "");
  const [iconCustomized, setIconCustomized] = useState(false);
  const [color, setColor] = useState(workspace?.color ?? (WORKSPACE_COLORS[0] as string));

  // Auto-derive icon from name unless user has manually edited the icon field
  const displayIcon = iconCustomized ? icon : name[0]?.toUpperCase() || "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const finalIcon = displayIcon.trim() || "?";
    if (isNew) {
      sendCommand(WORKSPACES_CREATE, { name: name.trim(), color, icon: finalIcon });
    } else {
      sendCommand(WORKSPACES_UPDATE, {
        workspaceId: workspace.id,
        changes: { name: name.trim(), color, icon: finalIcon },
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
      <div className="flex items-center" style={{ gap: "0.375rem" }}>
        <input
          type="text"
          value={displayIcon}
          onChange={(e) => {
            setIcon(e.target.value.slice(0, 2));
            setIconCustomized(true);
          }}
          placeholder="?"
          className="outline-none text-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-full)",
            background: color,
            color: "var(--glass-text-primary)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            border: "none",
            fontFamily: "inherit",
          }}
        />
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
      <div className="flex items-center" style={{ gap: "0.25rem" }}>
        {WORKSPACE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="cursor-pointer"
            onClick={() => setColor(c)}
            style={{
              width: 16,
              height: 16,
              borderRadius: "var(--radius-full)",
              background: c,
              border: c === color ? "2px solid var(--glass-text-primary)" : "2px solid transparent",
            }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="flex items-center" style={{ gap: "0.375rem" }}>
        <button
          type="submit"
          className="cursor-pointer text-glass-text-primary hover:bg-glass-hover focus-ring"
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
          className="cursor-pointer text-glass-text-muted hover:text-glass-text-default focus-ring"
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
            className="cursor-pointer text-glass-text-muted hover:text-destructive focus-ring"
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
function FadePresence({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(visible);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transition: "opacity var(--duration-normal) var(--ease-in-out)",
      }}
      onTransitionEnd={() => {
        if (!visible) setMounted(false);
      }}
    >
      {children}
    </div>
  );
}

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: WorkspaceId | null;
  focusedWsIdx: number;
  onWsBarKeyDown: (e: React.KeyboardEvent) => void;
  editorMode: "none" | "new" | WorkspaceId;
  onEditorModeChange: (mode: "none" | "new" | WorkspaceId) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  focusedWsIdx,
  onWsBarKeyDown,
  editorMode,
  onEditorModeChange,
}: WorkspaceSwitcherProps) {
  return (
    <>
      {/* Workspace editor */}
      <FadePresence visible={editorMode !== "none"}>
        <WorkspaceEditor
          workspace={editorMode !== "new" ? workspaces.find((w) => w.id === editorMode) : undefined}
          onClose={() => onEditorModeChange("none")}
        />
      </FadePresence>

      {/* Workspace bar with roving tabindex */}
      <div className="flex items-center" style={{ gap: "0.375rem", padding: "0.625rem 0.75rem" }}>
        <div
          className="flex items-center"
          role="toolbar"
          aria-label="Workspaces"
          style={{ gap: "0.375rem" }}
          onKeyDown={onWsBarKeyDown}
        >
          {workspaces.map((ws, i) => (
            <WorkspaceBubble
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              focused={i === focusedWsIdx}
              onEdit={() => onEditorModeChange(ws.id)}
            />
          ))}
        </div>
        <button
          type="button"
          className="flex items-center justify-center cursor-pointer text-glass-text-hint hover:text-glass-text-default hover:bg-glass-hover focus-ring"
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--radius-full)",
            border: "none",
            background: "transparent",
            fontSize: "var(--text-sm)",
          }}
          onClick={() => onEditorModeChange(activeWorkspaceId ?? "none")}
          aria-label="Edit workspace"
          data-tip="Edit workspace"
        >
          <Icon name="pencil" css={{ fontSize: 10 }} />
        </button>
        <button
          type="button"
          className="flex items-center justify-center cursor-pointer text-glass-text-hint hover:text-glass-text-default hover:bg-glass-hover focus-ring"
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--radius-full)",
            border: "none",
            background: "transparent",
            fontSize: "var(--text-sm)",
          }}
          onClick={() => onEditorModeChange("new")}
          aria-label="Add workspace"
          data-tip="Add workspace"
        >
          <Icon name="plus" css={{ fontSize: 10 }} />
        </button>
      </div>
    </>
  );
}

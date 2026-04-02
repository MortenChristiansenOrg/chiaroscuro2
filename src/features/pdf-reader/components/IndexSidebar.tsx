import { useCallback, useRef, useState } from "react";
import { Icon } from "../../../renderer/src/components/Icon";
import type { IndexEntry } from "../pdf-reader.shared";

interface IndexSidebarProps {
  entries: IndexEntry[];
  currentPage: number;
  onNavigate: (page: number) => void;
  onAdd: (label: string, page: number) => void;
  onUpdate: (entryId: string, label: string) => void;
  onDelete: (entryId: string) => void;
  onReorder: (entryIds: string[]) => void;
}

const sidebarStyle: React.CSSProperties = {
  width: "15rem",
  borderRight: "1px solid var(--border)",
  backgroundColor: "var(--content-bg)",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--foreground)",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "0.375rem",
};

const entryClass =
  "flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer text-[length:var(--text-sm)] text-[var(--foreground)] min-h-[var(--click-target-min)] select-none hover:bg-[oklch(0_0_0/0.04)]";

const sidebarButtonClass =
  "flex items-center justify-center min-w-[var(--click-target-min)] min-h-[var(--click-target-min)] p-1 rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--foreground)] cursor-pointer text-[length:var(--text-xs)] hover:bg-[oklch(0_0_0/0.06)] active:bg-[oklch(0_0_0/0.12)]";

export function IndexSidebar({
  entries,
  currentPage,
  onNavigate,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: IndexSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPage, setNewPage] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  const sorted = [...entries].sort((a, b) => a.order - b.order);

  const startEdit = (entry: IndexEntry) => {
    setEditingId(entry.id);
    setEditLabel(entry.label);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    if (editingId && editLabel.trim()) {
      onUpdate(editingId, editLabel.trim());
    }
    setEditingId(null);
    setEditLabel("");
  };

  const startAdd = () => {
    const page = currentPage;
    setAddingNew(true);
    setNewPage(page);
    setNewLabel(`Page ${page}`);
  };

  const commitAdd = () => {
    if (newLabel.trim() && newPage !== null) {
      onAdd(newLabel.trim(), newPage);
    }
    setAddingNew(false);
    setNewLabel("");
    setNewPage(null);
  };

  const handleDragStart = (e: React.DragEvent, entryId: string) => {
    setDraggedId(entryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const ids = sorted.map((e) => e.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedId);
    onReorder(ids);
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "0.125rem 0.375rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "var(--text-sm)",
    outline: "none",
    minWidth: 0,
  };

  return (
    <div style={sidebarStyle}>
      <div style={headerStyle}>
        <span>Index</span>
        <button
          type="button"
          onClick={startAdd}
          className={sidebarButtonClass}
          data-tip="Add index entry"
          aria-label="Add index entry"
        >
          <Icon name="plus" />
        </button>
      </div>
      <div style={listStyle}>
        {sorted.map((entry) => (
          <div
            key={entry.id}
            tabIndex={editingId !== entry.id ? 0 : undefined}
            draggable={editingId !== entry.id}
            onDragStart={(e) => handleDragStart(e, entry.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, entry.id)}
            onDragEnd={handleDragEnd}
            onClick={() => editingId !== entry.id && onNavigate(entry.page)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editingId !== entry.id && e.currentTarget === e.target) {
                onNavigate(entry.page);
              }
            }}
            onDoubleClick={() => startEdit(entry)}
            className={entryClass}
            style={{
              backgroundColor:
                entry.page === currentPage
                  ? "var(--accent)"
                  : draggedId === entry.id
                    ? "var(--muted)"
                    : undefined,
              color: entry.page === currentPage ? "var(--accent-foreground)" : undefined,
              opacity: draggedId === entry.id ? 0.5 : 1,
            }}
          >
            {editingId === entry.id ? (
              <input
                ref={editInputRef}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditLabel("");
                  }
                }}
                style={inputStyle}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <Icon
                  name="grip-vertical"
                  css={{
                    fontSize: "var(--text-xs)",
                    color: "var(--muted-foreground)",
                    cursor: "grab",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.label}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--muted-foreground)",
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  p.{entry.page}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className={sidebarButtonClass}
                  style={{
                    minWidth: "1.25rem",
                    minHeight: "1.25rem",
                    opacity: 0.5,
                  }}
                  data-tip="Delete entry"
                  aria-label="Delete entry"
                >
                  <Icon name="xmark" css={{ fontSize: "0.5rem" }} />
                </button>
              </>
            )}
          </div>
        ))}
        {addingNew && (
          <div className={entryClass} style={{ gap: "0.375rem" }}>
            <input
              ref={addInputRef}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") {
                  setAddingNew(false);
                  setNewLabel("");
                  setNewPage(null);
                }
              }}
              placeholder="Entry label"
              style={inputStyle}
            />
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--muted-foreground)",
                fontFamily: "var(--font-mono)",
              }}
            >
              p.{newPage ?? currentPage}
            </span>
          </div>
        )}
        {entries.length === 0 && !addingNew && (
          <div
            style={{
              padding: "1rem",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: "var(--text-xs)",
            }}
          >
            No index entries yet.
            <br />
            Click + to add one.
          </div>
        )}
      </div>
    </div>
  );
}

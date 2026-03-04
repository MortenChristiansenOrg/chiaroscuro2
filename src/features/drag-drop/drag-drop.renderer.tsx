import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import { DRAG_DROP_OPEN_FILES, type DragDropCommands } from "./drag-drop.shared";

function sendCommand<K extends keyof DragDropCommands>(
  name: K,
  payload: DragDropCommands[K]["payload"],
): void {
  window.chiaroscuro.sendCommand(name, payload);
}

/** Electron adds `path` to File objects, but the standard TS type doesn't include it. */
interface ElectronFile extends File {
  path: string;
}

/** Check if the drag event carries files (works with both Array and DOMStringList). */
function hasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.prototype.includes.call(types, "Files");
}

export function DragDropOverlay() {
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setDragging(true);
    }

    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    }

    function onDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);

      const files = Array.from(e.dataTransfer?.files ?? []) as ElectronFile[];
      if (files.length === 0) return;

      const filePaths = files.map((f) => f.path).filter(Boolean);
      if (filePaths.length === 0) return;

      sendCommand(DRAG_DROP_OPEN_FILES, { filePaths });
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!dragging) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-3"
      style={{
        zIndex: "var(--z-overlay)",
        padding: "var(--content-inset)",
      }}
    >
      <div
        className="flex flex-1 w-full flex-col items-center justify-center gap-3"
        style={{
          borderRadius: "var(--radius-lg)",
          background: "oklch(0.2 0.02 250 / 0.85)",
          backdropFilter: "blur(var(--glass-backdrop-blur))",
          border: "2px dashed var(--glass-text-muted)",
          color: "var(--glass-text-primary)",
          fontFamily: "var(--font-sans)",
          animation: "drop-zone-enter var(--duration-fast) var(--ease-out) both",
        }}
      >
        <Icon
          name="file-arrow-down"
          css={{ fontSize: "2rem", color: "var(--glass-text-default)" }}
        />
        <span style={{ fontSize: "var(--text-sm)", color: "var(--glass-text-default)" }}>
          Drop files to open in tabs
        </span>
      </div>
    </div>
  );
}

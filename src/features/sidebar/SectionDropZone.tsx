import { useState } from "react";
import type { FolderId, TabId } from "../../shared/types";
import { FOLDERS_REORDER, type FoldersCommands } from "../folders/folders.shared";
import type { TabsCommands } from "../tabs/tabs.shared";
import { TABS_REORDER } from "../tabs/tabs.shared";

// ── Typed sendCommand ───────────────────────────────────────────

type DropZoneUsedCommands = Pick<TabsCommands, typeof TABS_REORDER> &
  Pick<FoldersCommands, typeof FOLDERS_REORDER>;

function sendCommand<K extends keyof DropZoneUsedCommands>(
  name: K,
  payload: DropZoneUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Component ───────────────────────────────────────────────────

export function SectionDropZone({
  targetBookmarked,
  dragTabIdRef,
  dragFolderIdRef,
  visible,
  onBeforeReorder,
  targetFolderId,
}: {
  targetBookmarked: boolean;
  dragTabIdRef: React.RefObject<TabId | null>;
  dragFolderIdRef?: React.RefObject<FolderId | null>;
  visible: boolean;
  onBeforeReorder?: () => void;
  targetFolderId?: FolderId | null;
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
        // Handle folder drop — move to root level
        if (dragFolderIdRef?.current) {
          const folderId = dragFolderIdRef.current;
          dragFolderIdRef.current = null;
          onBeforeReorder?.();
          sendCommand(FOLDERS_REORDER, {
            folderId,
            parentFolderId: null,
          });
          return;
        }
        // Handle tab drop
        const tabId = dragTabIdRef.current;
        dragTabIdRef.current = null;
        if (!tabId) return;
        onBeforeReorder?.();
        sendCommand(TABS_REORDER, {
          tabId,
          targetBookmarked,
          targetFolderId: targetFolderId ?? null,
        });
      }}
    />
  );
}

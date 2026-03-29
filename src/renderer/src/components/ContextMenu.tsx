import { useRef } from "react";
import { CONTEXT_MENU_SHOW } from "../../../features/context-menu/context-menu.shared";

// ── Types ───────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  onSelect: () => void;
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * Returns a trigger function for native context menus.
 * Call `open(items, e)` inside an onContextMenu handler.
 */
export function useContextMenu(): {
  open: (items: ContextMenuItem[], e: React.MouseEvent) => void;
} {
  const callbacksRef = useRef<(() => void)[]>([]);

  const open = (items: ContextMenuItem[], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    callbacksRef.current = items.map((it) => it.onSelect);

    window.chiaroscuro
      .sendCommand(CONTEXT_MENU_SHOW, {
        items: items.map((it) => ({ label: it.label, icon: it.icon, disabled: it.disabled })),
        x: e.clientX,
        y: e.clientY,
      })
      .then((result) => {
        const index = result as number;
        if (index >= 0 && index < callbacksRef.current.length) {
          callbacksRef.current[index]?.();
        }
      })
      .catch(() => {});
  };

  return { open };
}

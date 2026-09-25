import {
  CONTEXT_MENU_SHOW,
  type ContextMenuItemData,
} from "../../../features/context-menu/context-menu.shared";

// ── Types ───────────────────────────────────────────────────────

interface ContextMenuAction {
  label: string;
  icon?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export type ContextMenuItem =
  | ContextMenuAction
  | {
      label: string;
      icon?: string;
      disabled?: boolean;
      submenu: ContextMenuAction[];
    };

// ── Hook ────────────────────────────────────────────────────────

/**
 * Returns a trigger function for native context menus.
 * Call `open(items, e)` inside an onContextMenu handler.
 */
export function useContextMenu(): {
  open: (items: ContextMenuItem[], e: React.MouseEvent) => void;
} {
  const open = (items: ContextMenuItem[], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const callbacks: (() => void)[] = [];
    const serializeAction = ({ onSelect, ...data }: ContextMenuAction) => {
      callbacks.push(onSelect);
      return data;
    };
    const menuItems: ContextMenuItemData[] = items.map((item) =>
      "submenu" in item
        ? { ...item, submenu: item.submenu.map(serializeAction) }
        : serializeAction(item),
    );

    window.chiaroscuro
      .sendCommand(CONTEXT_MENU_SHOW, {
        items: menuItems,
        x: e.clientX,
        y: e.clientY,
      })
      .then((result) => {
        const index = result as number;
        if (index >= 0 && index < callbacks.length) {
          callbacks[index]?.();
        }
      })
      .catch(() => {});
  };

  return { open };
}

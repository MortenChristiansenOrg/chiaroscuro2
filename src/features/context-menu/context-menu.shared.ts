export const CONTEXT_MENU_SHOW = "context-menu:show" as const;

export interface ContextMenuItemData {
  label: string;
  disabled?: boolean;
}

export interface ContextMenuShowPayload {
  items: ContextMenuItemData[];
  x: number;
  y: number;
}

export type ContextMenuCommands = {
  [CONTEXT_MENU_SHOW]: { payload: ContextMenuShowPayload; response: number };
};

export type ContextMenuEvents = Record<string, never>;

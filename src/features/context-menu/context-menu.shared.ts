import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  ContextMenuItemDataSchema,
  ContextMenuShowPayloadSchema,
  commandContracts,
} from "./context-menu.contracts";
export const CONTEXT_MENU_SHOW = "context-menu:show" as const;

export type ContextMenuItemData = z.infer<typeof ContextMenuItemDataSchema>;

export type ContextMenuShowPayload = z.infer<typeof ContextMenuShowPayloadSchema>;

export type ContextMenuCommands = CommandTypes<typeof commandContracts>;

export type ContextMenuEvents = Record<string, never>;

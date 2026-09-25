import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import { CONTEXT_MENU_SHOW } from "./context-menu.shared";

const ContextMenuActionDataSchema = z.strictObject({
  label: z.string(),
  icon: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const ContextMenuItemDataSchema = ContextMenuActionDataSchema.extend({
  submenu: z.array(ContextMenuActionDataSchema).optional(),
});

export const ContextMenuShowPayloadSchema = z.strictObject({
  tabId: TabIdSchema.optional(),
  items: z.array(ContextMenuItemDataSchema),
  x: z.number(),
  y: z.number(),
});

export const commandContracts = {
  [CONTEXT_MENU_SHOW]: defineCommand(ContextMenuShowPayloadSchema, z.number(), {
    description: "Show a native menu and return the depth-first leaf index, or -1 when dismissed.",
    examples: [{ items: [], x: 0, y: 0 }],
    sideEffects: ["Opens a native context menu"],
  }),
};

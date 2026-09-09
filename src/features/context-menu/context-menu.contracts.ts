import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { CONTEXT_MENU_SHOW } from "./context-menu.shared";

export const ContextMenuItemDataSchema = z.strictObject({
  label: z.string(),
  icon: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const ContextMenuShowPayloadSchema = z.strictObject({
  items: z.array(ContextMenuItemDataSchema),
  x: z.number(),
  y: z.number(),
});

export const commandContracts = {
  [CONTEXT_MENU_SHOW]: defineCommand(ContextMenuShowPayloadSchema, z.number(), {
    description: "Show a native menu and return the selected index, or -1 when dismissed.",
    examples: [{ items: [], x: 0, y: 0 }],
    sideEffects: ["Opens a native context menu"],
  }),
};

import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { commandContracts, TooltipShowPayloadSchema } from "./tooltip.contracts";
export const TOOLTIP_SHOW = "tooltip:show" as const;
export const TOOLTIP_HIDE = "tooltip:hide" as const;

export type TooltipShowPayload = z.infer<typeof TooltipShowPayloadSchema>;

export type TooltipCommands = CommandTypes<typeof commandContracts>;

export type TooltipEvents = Record<string, never>;

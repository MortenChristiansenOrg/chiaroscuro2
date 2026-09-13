import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TOOLTIP_HIDE, TOOLTIP_SHOW } from "./tooltip.shared";

export const TooltipShowPayloadSchema = z.strictObject({
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const commandContracts = {
  [TOOLTIP_SHOW]: defineCommand(TooltipShowPayloadSchema, z.undefined(), {
    description: "Show a native tooltip at the supplied rectangle.",
    examples: [{ text: "example text", x: 0, y: 0, width: 240, height: 600 }],
    sideEffects: ["Displays a tooltip overlay"],
  }),
  [TOOLTIP_HIDE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Hide the native tooltip.",
    examples: [undefined],
    sideEffects: ["Hides a tooltip overlay"],
  }),
};

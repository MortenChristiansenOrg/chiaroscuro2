import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { APP_STATE_SAVE, APP_STATE_SET_SIDEBAR_WIDTH } from "./app-state.shared";

export const SetSidebarWidthPayloadSchema = z.strictObject({ width: z.number() });

export const commandContracts = {
  [APP_STATE_SAVE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Persist the current application layout.",
    examples: [undefined],
    sideEffects: ["Writes settings to disk"],
  }),
  [APP_STATE_SET_SIDEBAR_WIDTH]: defineCommand(SetSidebarWidthPayloadSchema, z.undefined(), {
    description: "Set and persist sidebar width in pixels.",
    examples: [{ width: 240 }],
    sideEffects: ["Changes sidebar layout and writes settings"],
  }),
};

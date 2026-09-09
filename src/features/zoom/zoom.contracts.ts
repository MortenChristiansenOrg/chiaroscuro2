import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { ZOOM_IN, ZOOM_OUT, ZOOM_RESET } from "./zoom.shared";

export const commandContracts = {
  [ZOOM_IN]: defineCommand(z.undefined(), z.undefined(), {
    description: "Increase the active web tab's isolated zoom.",
    examples: [undefined],
    sideEffects: ["Changes page scale"],
  }),
  [ZOOM_OUT]: defineCommand(z.undefined(), z.undefined(), {
    description: "Decrease the active web tab's isolated zoom.",
    examples: [undefined],
    sideEffects: ["Changes page scale"],
  }),
  [ZOOM_RESET]: defineCommand(z.undefined(), z.undefined(), {
    description: "Reset the active web tab's isolated zoom.",
    examples: [undefined],
    sideEffects: ["Changes page scale"],
  }),
};

import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { DEVTOOLS_TOGGLE, DEVTOOLS_TOGGLE_CHROME } from "./dev-tools.shared";

export const commandContracts = {
  [DEVTOOLS_TOGGLE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle developer tools for the active web tab.",
    examples: [undefined],
    sideEffects: ["Opens or closes developer tools"],
  }),
  [DEVTOOLS_TOGGLE_CHROME]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle developer tools for browser chrome.",
    examples: [undefined],
    sideEffects: ["Opens or closes chrome developer tools"],
  }),
};

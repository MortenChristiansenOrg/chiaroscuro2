import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { SIDEBAR_TOGGLE } from "./sidebar.shared";

export const commandContracts = {
  [SIDEBAR_TOGGLE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle sidebar visibility.",
    examples: [undefined],
    sideEffects: ["Changes sidebar layout"],
  }),
};

import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { DEBUG_SERVER_START, DEBUG_SERVER_STOP } from "./debug-server.shared";

export const commandContracts = {
  [DEBUG_SERVER_START]: defineCommand(z.undefined(), z.undefined(), {
    description: "Start the local debug HTTP server.",
    examples: [undefined],
    sideEffects: ["Opens a loopback listening port"],
  }),
  [DEBUG_SERVER_STOP]: defineCommand(z.undefined(), z.undefined(), {
    description: "Stop the local debug HTTP server.",
    examples: [undefined],
    sideEffects: ["Closes the debug listening port"],
  }),
};

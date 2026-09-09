import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import { TERMINAL_CLEAR, TERMINAL_TOGGLE, TERMINAL_WRITE } from "./terminal.shared";

export const TerminalWritePayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  data: z.string(),
  type: z.union([z.literal("stdout"), z.literal("stderr")]),
});

export const commandContracts = {
  [TERMINAL_TOGGLE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle the local application terminal.",
    examples: [undefined],
    sideEffects: ["Changes terminal visibility"],
  }),
  [TERMINAL_CLEAR]: defineCommand(z.undefined(), z.undefined(), {
    description: "Clear the active tab's terminal output.",
    examples: [undefined],
    sideEffects: ["Removes in-memory terminal lines"],
  }),
  [TERMINAL_WRITE]: defineCommand(TerminalWritePayloadSchema, z.undefined(), {
    description: "Append a stdout or stderr chunk to a tab's terminal.",
    examples: [{ tabId: "tab-example", data: "server started\n", type: "stdout" }],
    sideEffects: ["Adds terminal output"],
  }),
};

import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { FIND_NEXT, FIND_PREVIOUS, FIND_START, FIND_STOP } from "./find-text.shared";

export const FindNextPayloadSchema = z.strictObject({ text: z.string() });

export const FindPreviousPayloadSchema = z.strictObject({ text: z.string() });

export const commandContracts = {
  [FIND_START]: defineCommand(z.undefined(), z.undefined(), {
    description: "Show Find in page for the active tab.",
    examples: [undefined],
    sideEffects: ["Changes focus and Find visibility"],
  }),
  [FIND_STOP]: defineCommand(z.undefined(), z.undefined(), {
    description: "Close Find in page and clear matches.",
    examples: [undefined],
    sideEffects: ["Clears page search highlights"],
  }),
  [FIND_NEXT]: defineCommand(FindNextPayloadSchema, z.undefined(), {
    description: "Find the next occurrence of text in the active tab.",
    examples: [{ text: "example text" }],
    sideEffects: ["Updates selection and page search highlights"],
  }),
  [FIND_PREVIOUS]: defineCommand(FindPreviousPayloadSchema, z.undefined(), {
    description: "Find the previous occurrence of text in the active tab.",
    examples: [{ text: "example text" }],
    sideEffects: ["Updates selection and page search highlights"],
  }),
};

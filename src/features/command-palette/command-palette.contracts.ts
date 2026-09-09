import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  COMMAND_PALETTE_EXECUTE,
  COMMAND_PALETTE_HIDE,
  COMMAND_PALETTE_SEARCH_VISITS,
  COMMAND_PALETTE_SHOW,
  COMMAND_PALETTE_TOGGLE,
} from "./command-palette.shared";

export const CommandPaletteExecutePayloadSchema = z.strictObject({
  command: z.string(),
  inCurrentTab: z.boolean().optional(),
});

export const CommandPaletteSearchVisitsPayloadSchema = z.strictObject({ query: z.string() });

export const SuggestionSchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  visitCount: z.number(),
});

export const commandContracts = {
  [COMMAND_PALETTE_SHOW]: defineCommand(z.undefined(), z.undefined(), {
    description: "Show and focus the command palette.",
    examples: [undefined],
    sideEffects: ["Opens a native overlay"],
  }),
  [COMMAND_PALETTE_HIDE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Hide the command palette.",
    examples: [undefined],
    sideEffects: ["Closes the palette overlay"],
  }),
  [COMMAND_PALETTE_TOGGLE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle command palette visibility.",
    examples: [undefined],
    sideEffects: ["Changes focus and overlay visibility"],
  }),
  [COMMAND_PALETTE_EXECUTE]: defineCommand(CommandPaletteExecutePayloadSchema, z.undefined(), {
    description: "Resolve typed input as a URL, search, or named palette command.",
    examples: [{ command: "https://example.com/" }],
    sideEffects: ["May navigate, create tabs, or invoke another command"],
  }),
  [COMMAND_PALETTE_SEARCH_VISITS]: defineCommand(
    CommandPaletteSearchVisitsPayloadSchema,
    z.array(SuggestionSchema),
    {
      description: "Find history suggestions matching a query.",
      examples: [{ query: "example" }],
      sideEffects: [],
    },
  ),
};

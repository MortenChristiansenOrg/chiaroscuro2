import { z } from "zod";
import { defineCommand } from "../../bus/contract";

export const AiSelectionSchema = z.strictObject({
  model: z.string().min(1),
  effort: z.string().min(1),
});
export const AiStateSchema = z.strictObject({
  connected: z.boolean(),
  sharing: z.boolean(),
  connecting: z.boolean(),
  account: z.string().optional(),
  error: z.string().optional(),
  selection: AiSelectionSchema,
  models: z.array(
    z.strictObject({ slug: z.string(), name: z.string(), efforts: z.array(z.string()) }),
  ),
});
const empty = z.strictObject({});
const describe = (description: string, sideEffects: string[] = []) => ({
  description,
  examples: [{}],
  sideEffects,
});
export const commandContracts = {
  "ai:get-state": defineCommand(
    empty,
    AiStateSchema,
    describe("Read the AI connection and global defaults."),
  ),
  "ai:connect": defineCommand(
    empty,
    z.undefined(),
    describe("Sign in with ChatGPT and request plan usage.", [
      "Opens system browser and saves protected credentials",
    ]),
  ),
  "ai:disconnect": defineCommand(
    empty,
    z.undefined(),
    describe("Sign out and cancel AI requests.", ["Deletes local tokens"]),
  ),
  "ai:cancel-sign-in": defineCommand(
    empty,
    z.undefined(),
    describe("Cancel pending ChatGPT sign-in."),
  ),
  "ai:refresh-models": defineCommand(
    empty,
    z.undefined(),
    describe("Refresh the account's model catalog."),
  ),
  "ai:set-selection": defineCommand(AiSelectionSchema, z.undefined(), {
    description: "Save global AI model and reasoning effort.",
    examples: [{ model: "gpt-6-luna", effort: "high" }],
    sideEffects: ["Persists global AI defaults"],
  }),
  "ai:manage-usage": defineCommand(
    empty,
    z.undefined(),
    describe("Open ChatGPT usage settings.", ["Opens system browser"]),
  ),
  "ai:generate-css": defineCommand(
    z.strictObject({
      id: z.string().uuid(),
      domain: z.string().min(1),
      request: z.string().min(1).max(16000),
    }),
    z.strictObject({ message: z.string() }),
    {
      description: "Generate, apply and visually inspect domain CSS.",
      examples: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          domain: "example.com",
          request: "Make the article wider",
        },
      ],
      sideEffects: [
        "Shares page structure and screenshots with OpenAI",
        "Applies and saves CSS with durable undo",
      ],
    },
  ),
  "ai:generate-script": defineCommand(
    z.strictObject({
      id: z.string().uuid(),
      domain: z.string().min(1),
      request: z.string().min(1).max(16000),
      source: z.string().max(1000000),
    }),
    z.string(),
    {
      description: "Generate an editable JavaScript draft for a domain.",
      examples: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          domain: "example.com",
          request: "Copy the page title",
          source: "",
        },
      ],
      sideEffects: ["Sends page context and draft to OpenAI using the ChatGPT plan"],
    },
  ),
  "ai:cancel": defineCommand(z.strictObject({ id: z.string().uuid() }), z.undefined(), {
    description: "Cancel an AI generation request.",
    examples: [{ id: "00000000-0000-4000-8000-000000000001" }],
    sideEffects: ["Aborts generation"],
  }),
};

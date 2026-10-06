import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { AiStateSchema, commandContracts } from "./ai.contracts";

export type AiState = z.infer<typeof AiStateSchema>;
export type AiCommands = CommandTypes<typeof commandContracts>;
export type AiEvents = {
  "ai:changed": AiState;
  "ai:progress": { id: string; message: string };
};
export const DEFAULT_AI_SELECTION = { model: "gpt-6-luna", effort: "high" };
export const MODEL_DEFAULT_EFFORT = "default";
export function reasoningEffortLabel(effort: string): string {
  return effort === MODEL_DEFAULT_EFFORT ? "Model default" : effort === "high" ? "High" : effort;
}

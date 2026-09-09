import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  LOCAL_WEB_APP_BROWSE_DIRECTORY,
  LOCAL_WEB_APP_DELETE_CONFIG,
  LOCAL_WEB_APP_GET_CONFIG,
  LOCAL_WEB_APP_SAVE_CONFIG,
  LOCAL_WEB_APP_START,
  LOCAL_WEB_APP_STOP,
} from "./local-web-app.shared";

export const LocalWebAppSaveConfigPayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  directory: z.string(),
  command: z.string(),
});

export const LocalWebAppTabPayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const LocalWebAppConfigSchema = z.strictObject({
  directory: z.string(),
  command: z.string(),
});

export const LocalWebAppStatusSchema = z.union([
  z.literal("running"),
  z.literal("stopped"),
  z.literal("error"),
]);

export const commandContracts = {
  [LOCAL_WEB_APP_SAVE_CONFIG]: defineCommand(LocalWebAppSaveConfigPayloadSchema, z.undefined(), {
    description: "Save a tab's working directory and local server command.",
    examples: [{ tabId: "tab-example", directory: "C:/Projects/example", command: "bun run dev" }],
    sideEffects: ["Writes local application configuration"],
  }),
  [LOCAL_WEB_APP_DELETE_CONFIG]: defineCommand(LocalWebAppTabPayloadSchema, z.undefined(), {
    description: "Delete a tab's local application configuration.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Removes configuration and may stop its process"],
  }),
  [LOCAL_WEB_APP_START]: defineCommand(LocalWebAppTabPayloadSchema, z.undefined(), {
    description: "Start the configured local application for a tab.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Executes a local shell command"],
  }),
  [LOCAL_WEB_APP_STOP]: defineCommand(LocalWebAppTabPayloadSchema, z.undefined(), {
    description: "Stop the configured local application for a tab.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Terminates the managed local process"],
  }),
  [LOCAL_WEB_APP_BROWSE_DIRECTORY]: defineCommand(
    z.undefined(),
    z.union([z.string(), z.undefined()]),
    {
      description: "Choose a working directory; returns no value on cancellation.",
      examples: [undefined],
      sideEffects: ["Opens a native directory picker"],
    },
  ),
  [LOCAL_WEB_APP_GET_CONFIG]: defineCommand(
    LocalWebAppTabPayloadSchema,
    z.union([LocalWebAppConfigSchema.extend({ status: LocalWebAppStatusSchema }), z.undefined()]),
    {
      description: "Read a tab's local application configuration and process status.",
      examples: [{ tabId: "tab-example" }],
      sideEffects: [],
    },
  ),
};

import { z } from "zod";
import { defineCommand } from "../../bus/contract";

export const SyncIssueSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["conflict", "too-large", "not-uploaded", "not-applied"]),
  message: z.string(),
  /** Identifies a conflict as shown, so a choice only applies to the versions the user saw. */
  version: z.string().optional(),
});
export const SyncStateSchema = z.strictObject({
  connected: z.boolean(),
  serviceUrl: z.string().optional(),
  syncing: z.boolean(),
  readOnly: z.boolean(),
  lastSyncedAt: z.number().optional(),
  lastFailedAt: z.number().optional(),
  error: z.string().optional(),
  issues: z.array(SyncIssueSchema),
});
const empty = z.strictObject({});
export const commandContracts = {
  "sync:get-state": defineCommand(empty, SyncStateSchema, {
    description: "Read the sync connection, last result and items that need attention.",
    examples: [{}],
    sideEffects: [],
  }),
  "sync:connect": defineCommand(
    z.strictObject({ url: z.string().max(2048), apiKey: z.string().max(256) }),
    z.undefined(),
    {
      description: "Connect this machine to the app data service and sync for the first time.",
      examples: [
        {
          url: "https://example.convex.site",
          apiKey: `ads_${"0".repeat(64)}`,
        },
      ],
      sideEffects: [
        "Saves the key encrypted on this machine",
        "Uploads and downloads domain styles, navigation rules and website scripts",
      ],
    },
  ),
  "sync:disconnect": defineCommand(empty, z.undefined(), {
    description: "Stop syncing on this machine and forget its key.",
    examples: [{}],
    sideEffects: ["Deletes the saved key; local customizations stay"],
  }),
  "sync:now": defineCommand(empty, z.undefined(), {
    description: "Sync now instead of waiting for the next automatic sync.",
    examples: [{}],
    sideEffects: ["Uploads and downloads changed customizations"],
  }),
  "sync:resolve": defineCommand(
    z.strictObject({
      id: z.string(),
      keep: z.enum(["this-machine", "other-machine"]),
      version: z.string(),
    }),
    z.undefined(),
    {
      description: "Settle a sync conflict by keeping one machine's version everywhere.",
      examples: [
        { id: "domains/example.com", keep: "this-machine", version: "3:0123456789abcdef" },
      ],
      sideEffects: ["Replaces the other version on this machine or on the service"],
    },
  ),
};

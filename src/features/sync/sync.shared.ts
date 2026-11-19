import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { commandContracts, SyncIssueSchema, SyncStateSchema } from "./sync.contracts";

export const SYNC_CHANGED = "sync:changed" as const;

export type SyncIssue = z.infer<typeof SyncIssueSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export type SyncCommands = CommandTypes<typeof commandContracts>;
export type SyncEvents = { [SYNC_CHANGED]: SyncState };

export const DISCONNECTED_SYNC_STATE: SyncState = {
  connected: false,
  syncing: false,
  readOnly: false,
  issues: [],
};

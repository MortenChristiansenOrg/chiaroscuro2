import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema, WorkspaceIdSchema } from "../../shared/types.contracts";
import {
  WORKSPACES_CREATE,
  WORKSPACES_DELETE,
  WORKSPACES_MOVE_TAB,
  WORKSPACES_RESTORE_TAB,
  WORKSPACES_SWITCH,
  WORKSPACES_UPDATE,
} from "./workspaces.shared";

export const WorkspacesSwitchPayloadSchema = z.strictObject({ workspaceId: WorkspaceIdSchema });

export const WorkspacesCreatePayloadSchema = z.strictObject({
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  privacyMode: z.boolean(),
});

export const WorkspaceSchema = z.strictObject({
  id: WorkspaceIdSchema,
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  privacyMode: z.boolean(),
  activeTabId: z.union([TabIdSchema, z.null()]),
});

export const WorkspacesUpdatePayloadSchema = z.strictObject({
  workspaceId: WorkspaceIdSchema,
  changes: WorkspaceSchema.pick({
    name: true,
    color: true,
    icon: true,
    privacyMode: true,
  }).partial(),
});

export const WorkspacesDeletePayloadSchema = z.strictObject({ workspaceId: WorkspaceIdSchema });

export const WorkspacesMoveTabPayloadSchema = z.strictObject({
  targetWorkspaceId: WorkspaceIdSchema,
});

export const commandContracts = {
  [WORKSPACES_SWITCH]: defineCommand(WorkspacesSwitchPayloadSchema, z.undefined(), {
    description: "Switch the active workspace.",
    examples: [{ workspaceId: "workspace-example" }],
    sideEffects: ["Changes visible tabs and workspace state"],
  }),
  [WORKSPACES_CREATE]: defineCommand(WorkspacesCreatePayloadSchema, WorkspaceIdSchema, {
    description: "Create a workspace.",
    examples: [{ name: "Example workspace", color: "#6366f1", icon: "folder", privacyMode: false }],
    sideEffects: ["Writes workspace metadata"],
  }),
  [WORKSPACES_UPDATE]: defineCommand(WorkspacesUpdatePayloadSchema, z.undefined(), {
    description: "Update selected workspace properties.",
    examples: [{ workspaceId: "workspace-example", changes: {} }],
    sideEffects: ["Writes workspace metadata"],
  }),
  [WORKSPACES_DELETE]: defineCommand(WorkspacesDeletePayloadSchema, z.undefined(), {
    description: "Delete a workspace.",
    examples: [{ workspaceId: "workspace-example" }],
    sideEffects: ["Removes workspace metadata and reorganizes its tabs"],
  }),
  [WORKSPACES_MOVE_TAB]: defineCommand(WorkspacesMoveTabPayloadSchema, z.undefined(), {
    description: "Move a tab into a workspace.",
    examples: [{ targetWorkspaceId: "example" }],
    sideEffects: ["Writes tab workspace membership"],
  }),
  [WORKSPACES_RESTORE_TAB]: defineCommand(z.undefined(), z.undefined(), {
    description: "Restore a bookmarked tab to its original URL.",
    examples: [undefined],
    sideEffects: ["Navigates the tab"],
  }),
};

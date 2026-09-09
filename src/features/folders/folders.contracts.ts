import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { FolderIdSchema, TabIdSchema, WorkspaceIdSchema } from "../../shared/types.contracts";
import {
  FOLDERS_CREATE,
  FOLDERS_GET_FOR_LEVEL,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_REORDER,
  FOLDERS_SET_ORDER,
  FOLDERS_TOGGLE,
  FOLDERS_TOGGLE_COLLAPSE,
} from "./folders.shared";

export const FoldersTogglePayloadSchema = z.strictObject({ tabId: TabIdSchema.optional() });

export const FoldersRenamePayloadSchema = z.strictObject({
  folderId: FolderIdSchema,
  name: z.string(),
});

export const FoldersToggleCollapsePayloadSchema = z.strictObject({ folderId: FolderIdSchema });

export const FoldersRemovePayloadSchema = z.strictObject({ folderId: FolderIdSchema });

export const FoldersReorderPayloadSchema = z.strictObject({
  folderId: FolderIdSchema,
  targetFolderId: FolderIdSchema.optional(),
  targetTabId: TabIdSchema.optional(),
  position: z.union([z.literal("before"), z.literal("after")]).optional(),
  parentFolderId: z.union([FolderIdSchema, z.null()]).optional(),
});

export const FoldersCreatePayloadSchema = z.strictObject({
  parentFolderId: z.union([FolderIdSchema, z.null()]).optional(),
  workspaceId: WorkspaceIdSchema.optional(),
});

export const FolderSchema = z.strictObject({
  id: FolderIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string(),
  parentFolderId: z.union([FolderIdSchema, z.null()]),
  collapsed: z.boolean(),
  order: z.number(),
});

export const commandContracts = {
  [FOLDERS_TOGGLE]: defineCommand(FoldersTogglePayloadSchema, z.undefined(), {
    description: "Toggle folder membership for a tab.",
    examples: [{}],
    sideEffects: ["Persists tab and folder organization"],
  }),
  [FOLDERS_RENAME]: defineCommand(FoldersRenamePayloadSchema, z.undefined(), {
    description: "Rename a bookmark folder.",
    examples: [{ folderId: "folder-example", name: "Example workspace" }],
    sideEffects: ["Writes folder metadata"],
  }),
  [FOLDERS_TOGGLE_COLLAPSE]: defineCommand(FoldersToggleCollapsePayloadSchema, z.undefined(), {
    description: "Toggle whether a bookmark folder is collapsed.",
    examples: [{ folderId: "folder-example" }],
    sideEffects: ["Writes folder layout"],
  }),
  [FOLDERS_REMOVE]: defineCommand(FoldersRemovePayloadSchema, z.undefined(), {
    description: "Remove a bookmark folder.",
    examples: [{ folderId: "folder-example" }],
    sideEffects: ["Changes persisted bookmark organization"],
  }),
  [FOLDERS_REORDER]: defineCommand(FoldersReorderPayloadSchema, z.undefined(), {
    description: "Move a folder within the bookmark hierarchy.",
    examples: [{ folderId: "folder-example" }],
    sideEffects: ["Writes folder order and parent"],
  }),
  [FOLDERS_CREATE]: defineCommand(FoldersCreatePayloadSchema, z.undefined(), {
    description: "Create a bookmark folder.",
    examples: [{}],
    sideEffects: ["Writes a new folder"],
  }),
  [FOLDERS_GET_FOR_LEVEL]: defineCommand(
    z.strictObject({
      workspaceId: WorkspaceIdSchema,
      parentFolderId: z.union([FolderIdSchema, z.null()]),
    }),
    z.array(FolderSchema),
    {
      description: "List folders at a workspace hierarchy level.",
      examples: [{ workspaceId: "workspace-example", parentFolderId: "example" }],
      sideEffects: [],
    },
  ),
  [FOLDERS_SET_ORDER]: defineCommand(
    z.strictObject({ folderId: FolderIdSchema, order: z.number() }),
    z.undefined(),
    {
      description: "Set the numeric sort order of a folder.",
      examples: [{ folderId: "folder-example", order: 0 }],
      sideEffects: ["Writes folder ordering"],
    },
  ),
};

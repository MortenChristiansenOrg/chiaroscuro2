import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  BoundsSchema,
  FolderIdSchema,
  NavigationUrlSchema,
  TabIdSchema,
  WorkspaceIdSchema,
} from "../../shared/types.contracts";
import {
  TABS_ACTIVATE,
  TABS_ADOPT,
  TABS_CLEAR_EPHEMERAL,
  TABS_CLOSE,
  TABS_CREATE,
  TABS_GET,
  TABS_GET_FOR_WORKSPACE,
  TABS_NAVIGATE,
  TABS_REORDER,
  TABS_REPORT_CONTENT_BOUNDS,
  TABS_SET_FOLDER_ID,
  TABS_SET_ORDER,
  TABS_SET_WORKSPACE,
  TABS_TOGGLE_BOOKMARK,
} from "./tabs.shared";

export const TabsCreatePayloadSchema = z.strictObject({
  url: NavigationUrlSchema,
  workspaceId: WorkspaceIdSchema.optional(),
  activate: z.boolean().optional(),
});

export const TabsClosePayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const TabsActivatePayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const TabsNavigatePayloadSchema = z.strictObject({
  url: NavigationUrlSchema,
  tabId: TabIdSchema.optional(),
});

export const TabsToggleBookmarkPayloadSchema = z.strictObject({ tabId: TabIdSchema.optional() });

export const TabsClearEphemeralPayloadSchema = z.strictObject({
  workspaceId: WorkspaceIdSchema.optional(),
});

export const TabsReorderPayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  targetBookmarked: z.boolean(),
  targetTabId: TabIdSchema.optional(),
  position: z.union([z.literal("before"), z.literal("after")]).optional(),
  targetFolderId: z.union([FolderIdSchema, z.null()]).optional(),
});

export const TabSchema = z.strictObject({
  id: TabIdSchema,
  workspaceId: WorkspaceIdSchema,
  url: z.string(),
  title: z.string(),
  favicon: z.string(),
  loading: z.boolean(),
  bookmarked: z.boolean(),
  builtIn: z.boolean().optional(),
  lastAccessedAt: z.number(),
  createdAt: z.number(),
  order: z.number(),
  folderId: z.union([FolderIdSchema, z.null()]),
  fixedUrl: z.string().optional(),
});

export const TabsAdoptPayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  workspaceId: WorkspaceIdSchema.optional(),
  activate: z.boolean().optional(),
});

export const commandContracts = {
  [TABS_CREATE]: defineCommand(TabsCreatePayloadSchema, TabIdSchema, {
    description: "Create a tab, optionally choosing its workspace and activation.",
    examples: [{ url: "https://example.com/" }],
    sideEffects: ["Creates web contents or a built-in page and persists tab metadata"],
  }),
  [TABS_CLOSE]: defineCommand(TabsClosePayloadSchema, z.undefined(), {
    description: "Close a tab by ID.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Destroys web contents and removes persisted tab metadata"],
  }),
  [TABS_ACTIVATE]: defineCommand(TabsActivatePayloadSchema, z.undefined(), {
    description: "Activate a tab by ID.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Changes focus and may load a restored tab"],
  }),
  [TABS_NAVIGATE]: defineCommand(TabsNavigatePayloadSchema, z.undefined(), {
    description: "Navigate a tab, defaulting to the active tab.",
    examples: [{ url: "https://example.com/" }],
    sideEffects: ["Loads a URL and writes tab metadata"],
  }),
  [TABS_TOGGLE_BOOKMARK]: defineCommand(TabsToggleBookmarkPayloadSchema, z.undefined(), {
    description: "Toggle a tab's bookmark, defaulting to the active tab.",
    examples: [{}],
    sideEffects: ["Changes persisted bookmarks"],
  }),
  [TABS_CLEAR_EPHEMERAL]: defineCommand(TabsClearEphemeralPayloadSchema, z.undefined(), {
    description: "Close ephemeral tabs in a workspace, defaulting to the active workspace.",
    examples: [{}],
    sideEffects: ["Closes web contents and removes tab metadata"],
  }),
  [TABS_REORDER]: defineCommand(TabsReorderPayloadSchema, z.undefined(), {
    description: "Reorder or move a tab within the sidebar.",
    examples: [{ tabId: "tab-example", targetBookmarked: false }],
    sideEffects: ["Writes tab ordering, folder, and bookmark state"],
  }),
  [TABS_REPORT_CONTENT_BOUNDS]: defineCommand(BoundsSchema, z.undefined(), {
    description: "Report the content viewport rectangle in device-independent pixels.",
    examples: [{ x: 0, y: 0, width: 240, height: 600 }],
    sideEffects: ["Moves and resizes native tab views"],
  }),
  [TABS_GET]: defineCommand(
    z.strictObject({ tabId: TabIdSchema }),
    z.union([TabSchema, z.undefined()]),
    {
      description: "Read a tab by ID; returns no value when missing.",
      examples: [{ tabId: "tab-example" }],
      sideEffects: [],
    },
  ),
  [TABS_GET_FOR_WORKSPACE]: defineCommand(
    z.strictObject({ workspaceId: WorkspaceIdSchema }),
    z.array(TabSchema),
    {
      description: "List tabs belonging to a workspace.",
      examples: [{ workspaceId: "workspace-example" }],
      sideEffects: [],
    },
  ),
  [TABS_SET_FOLDER_ID]: defineCommand(
    z.strictObject({ tabId: TabIdSchema, folderId: z.union([FolderIdSchema, z.null()]) }),
    z.undefined(),
    {
      description: "Assign a tab to a folder, or null for the root level.",
      examples: [{ tabId: "tab-example", folderId: "folder-example" }],
      sideEffects: ["Writes tab organization"],
    },
  ),
  [TABS_SET_ORDER]: defineCommand(
    z.strictObject({ tabId: TabIdSchema, order: z.number() }),
    z.undefined(),
    {
      description: "Set a tab's numeric sort order.",
      examples: [{ tabId: "tab-example", order: 0 }],
      sideEffects: ["Writes tab ordering"],
    },
  ),
  [TABS_SET_WORKSPACE]: defineCommand(
    z.strictObject({ tabId: TabIdSchema, workspaceId: WorkspaceIdSchema }),
    z.undefined(),
    {
      description: "Assign a tab to a workspace.",
      examples: [{ tabId: "tab-example", workspaceId: "workspace-example" }],
      sideEffects: ["Writes tab workspace membership"],
    },
  ),
  [TABS_ADOPT]: defineCommand(TabsAdoptPayloadSchema, TabIdSchema, {
    description: "Adopt an existing native child view as an ordinary tab.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Changes ownership and persists tab metadata"],
  }),
};

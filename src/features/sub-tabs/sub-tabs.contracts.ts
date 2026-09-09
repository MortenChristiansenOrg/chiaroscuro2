import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  SUB_TABS_CLOSE,
  SUB_TABS_CLOSE_ALL,
  SUB_TABS_GET_STACK,
  SUB_TABS_OPEN,
  SUB_TABS_PROMOTE,
} from "./sub-tabs.shared";

export const SubTabsOpenPayloadSchema = z.strictObject({
  parentTabId: TabIdSchema,
  url: z.string(),
});

export const SubTabsClosePayloadSchema = z.strictObject({ parentTabId: TabIdSchema });

export const SubTabsCloseAllPayloadSchema = z.strictObject({ parentTabId: TabIdSchema });

export const SubTabsPromotePayloadSchema = z.strictObject({ parentTabId: TabIdSchema });

export const SubTabsGetStackPayloadSchema = z.strictObject({ parentTabId: TabIdSchema });

export const SubTabSchema = z.strictObject({
  id: TabIdSchema,
  parentTabId: TabIdSchema,
  url: z.string(),
  title: z.string(),
  favicon: z.string(),
  loading: z.boolean(),
});

export const commandContracts = {
  [SUB_TABS_OPEN]: defineCommand(SubTabsOpenPayloadSchema, TabIdSchema, {
    description: "Open a URL as a child of a parent tab.",
    examples: [{ parentTabId: "tab-example", url: "https://example.com/" }],
    sideEffects: ["Creates web contents and loads a page"],
  }),
  [SUB_TABS_CLOSE]: defineCommand(SubTabsClosePayloadSchema, z.undefined(), {
    description: "Close the top child tab for a parent.",
    examples: [{ parentTabId: "tab-example" }],
    sideEffects: ["Destroys child web contents"],
  }),
  [SUB_TABS_CLOSE_ALL]: defineCommand(SubTabsCloseAllPayloadSchema, z.undefined(), {
    description: "Close all child tabs for a parent.",
    examples: [{ parentTabId: "tab-example" }],
    sideEffects: ["Destroys child web contents"],
  }),
  [SUB_TABS_PROMOTE]: defineCommand(SubTabsPromotePayloadSchema, TabIdSchema, {
    description: "Promote the top child to an ordinary tab.",
    examples: [{ parentTabId: "tab-example" }],
    sideEffects: ["Changes tab ownership and focus"],
  }),
  [SUB_TABS_GET_STACK]: defineCommand(SubTabsGetStackPayloadSchema, z.array(SubTabSchema), {
    description: "Read the child-tab stack for a parent.",
    examples: [{ parentTabId: "tab-example" }],
    sideEffects: [],
  }),
};

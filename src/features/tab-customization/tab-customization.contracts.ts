import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  TAB_CUSTOMIZATION_CLOSE,
  TAB_CUSTOMIZATION_GET_STATE,
  TAB_CUSTOMIZATION_OPEN,
  TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED,
  TAB_CUSTOMIZATION_SET_TITLE,
} from "./tab-customization.shared";

export const TabCustomizationOpenPayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const TabCustomizationClosePayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const TabCustomizationSetTitlePayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  title: z.union([z.string(), z.null()]),
});

export const TabCustomizationSetFixedAddressDisabledPayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  disabled: z.boolean(),
});

export const TabCustomizationGetStatePayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const TabCustomizationSchema = z.strictObject({
  title: z.union([z.string(), z.null()]),
  fixedAddressDisabled: z.boolean(),
});

export const commandContracts = {
  [TAB_CUSTOMIZATION_OPEN]: defineCommand(TabCustomizationOpenPayloadSchema, z.undefined(), {
    description: "Open customization for a tab.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Opens a customization page"],
  }),
  [TAB_CUSTOMIZATION_CLOSE]: defineCommand(TabCustomizationClosePayloadSchema, z.undefined(), {
    description: "Close tab customization.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Closes the customization page"],
  }),
  [TAB_CUSTOMIZATION_SET_TITLE]: defineCommand(
    TabCustomizationSetTitlePayloadSchema,
    z.undefined(),
    {
      description: "Set a custom title for a tab.",
      examples: [{ tabId: "tab-example", title: "Example title" }],
      sideEffects: ["Writes tab customization"],
    },
  ),
  [TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED]: defineCommand(
    TabCustomizationSetFixedAddressDisabledPayloadSchema,
    z.undefined(),
    {
      description: "Configure whether a bookmarked tab keeps its original address.",
      examples: [{ tabId: "tab-example", disabled: false }],
      sideEffects: ["Writes tab customization"],
    },
  ),
  [TAB_CUSTOMIZATION_GET_STATE]: defineCommand(
    TabCustomizationGetStatePayloadSchema,
    TabCustomizationSchema,
    {
      description: "Read a tab's customization.",
      examples: [{ tabId: "tab-example" }],
      sideEffects: [],
    },
  ),
};

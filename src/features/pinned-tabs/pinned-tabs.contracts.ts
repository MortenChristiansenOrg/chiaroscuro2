import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  PINNED_TABS_ACTIVATE,
  PINNED_TABS_IS_PINNED,
  PINNED_TABS_TOGGLE_PIN,
} from "./pinned-tabs.shared";

export const PinnedTabsTogglePinPayloadSchema = z.strictObject({ tabId: TabIdSchema.optional() });

export const PinnedTabsActivatePayloadSchema = z.strictObject({ tabId: TabIdSchema });

export const commandContracts = {
  [PINNED_TABS_TOGGLE_PIN]: defineCommand(PinnedTabsTogglePinPayloadSchema, z.undefined(), {
    description: "Toggle pinning for a tab, defaulting to the active tab.",
    examples: [{}],
    sideEffects: ["Changes and persists global pinned tabs"],
  }),
  [PINNED_TABS_ACTIVATE]: defineCommand(PinnedTabsActivatePayloadSchema, z.undefined(), {
    description: "Activate a pinned tab.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: ["Changes focus and visible page"],
  }),
  [PINNED_TABS_IS_PINNED]: defineCommand(z.strictObject({ tabId: TabIdSchema }), z.boolean(), {
    description: "Check whether a tab is pinned.",
    examples: [{ tabId: "tab-example" }],
    sideEffects: [],
  }),
};

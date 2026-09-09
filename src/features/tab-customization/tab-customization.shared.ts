import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type {
  commandContracts,
  TabCustomizationClosePayloadSchema,
  TabCustomizationGetStatePayloadSchema,
  TabCustomizationOpenPayloadSchema,
  TabCustomizationSchema,
  TabCustomizationSetFixedAddressDisabledPayloadSchema,
  TabCustomizationSetTitlePayloadSchema,
} from "./tab-customization.contracts";

// ── Command names ────────────────────────────────────────────────
export const TAB_CUSTOMIZATION_OPEN = "tab-customization:open" as const;
export const TAB_CUSTOMIZATION_CLOSE = "tab-customization:close" as const;
export const TAB_CUSTOMIZATION_SET_TITLE = "tab-customization:set-title" as const;
export const TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED =
  "tab-customization:set-fixed-address-disabled" as const;
export const TAB_CUSTOMIZATION_GET_STATE = "tab-customization:get-state" as const;

// ── Event names ──────────────────────────────────────────────────
export const TAB_CUSTOMIZATION_OPENED = "tab-customization:opened" as const;
export const TAB_CUSTOMIZATION_CLOSED = "tab-customization:closed" as const;
export const TAB_CUSTOMIZATION_CHANGED = "tab-customization:changed" as const;
export const TAB_CUSTOMIZATION_REMOVED = "tab-customization:removed" as const;

// ── Data types ───────────────────────────────────────────────────
export type TabCustomization = z.infer<typeof TabCustomizationSchema>;

// ── Payload types ────────────────────────────────────────────────
export type TabCustomizationOpenPayload = z.infer<typeof TabCustomizationOpenPayloadSchema>;

export type TabCustomizationClosePayload = z.infer<typeof TabCustomizationClosePayloadSchema>;

export type TabCustomizationSetTitlePayload = z.infer<typeof TabCustomizationSetTitlePayloadSchema>;

export type TabCustomizationSetFixedAddressDisabledPayload = z.infer<
  typeof TabCustomizationSetFixedAddressDisabledPayloadSchema
>;

export type TabCustomizationGetStatePayload = z.infer<typeof TabCustomizationGetStatePayloadSchema>;

// ── Event payloads ───────────────────────────────────────────────
export interface TabCustomizationOpenedEvent {
  tabId: TabId;
}

export interface TabCustomizationClosedEvent {
  tabId: TabId;
}

export interface TabCustomizationChangedEvent {
  tabId: TabId;
  customization: TabCustomization;
}

export interface TabCustomizationRemovedEvent {
  tabId: TabId;
}

// ── Command registry ─────────────────────────────────────────────
export type TabCustomizationCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type TabCustomizationEvents = {
  [TAB_CUSTOMIZATION_OPENED]: TabCustomizationOpenedEvent;
  [TAB_CUSTOMIZATION_CLOSED]: TabCustomizationClosedEvent;
  [TAB_CUSTOMIZATION_CHANGED]: TabCustomizationChangedEvent;
  [TAB_CUSTOMIZATION_REMOVED]: TabCustomizationRemovedEvent;
};

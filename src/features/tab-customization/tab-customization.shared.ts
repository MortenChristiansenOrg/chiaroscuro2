import type { TabId } from "../../shared/types";

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
export interface TabCustomization {
  title: string | null;
  fixedAddressDisabled: boolean;
}

// ── Payload types ────────────────────────────────────────────────
export interface TabCustomizationOpenPayload {
  tabId: TabId;
}

export interface TabCustomizationClosePayload {
  tabId: TabId;
}

export interface TabCustomizationSetTitlePayload {
  tabId: TabId;
  title: string | null;
}

export interface TabCustomizationSetFixedAddressDisabledPayload {
  tabId: TabId;
  disabled: boolean;
}

export interface TabCustomizationGetStatePayload {
  tabId: TabId;
}

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
export type TabCustomizationCommands = {
  [TAB_CUSTOMIZATION_OPEN]: { payload: TabCustomizationOpenPayload; response: undefined };
  [TAB_CUSTOMIZATION_CLOSE]: { payload: TabCustomizationClosePayload; response: undefined };
  [TAB_CUSTOMIZATION_SET_TITLE]: {
    payload: TabCustomizationSetTitlePayload;
    response: undefined;
  };
  [TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED]: {
    payload: TabCustomizationSetFixedAddressDisabledPayload;
    response: undefined;
  };
  [TAB_CUSTOMIZATION_GET_STATE]: {
    payload: TabCustomizationGetStatePayload;
    response: TabCustomization;
  };
};

// ── Event registry ───────────────────────────────────────────────
export type TabCustomizationEvents = {
  [TAB_CUSTOMIZATION_OPENED]: TabCustomizationOpenedEvent;
  [TAB_CUSTOMIZATION_CLOSED]: TabCustomizationClosedEvent;
  [TAB_CUSTOMIZATION_CHANGED]: TabCustomizationChangedEvent;
  [TAB_CUSTOMIZATION_REMOVED]: TabCustomizationRemovedEvent;
};

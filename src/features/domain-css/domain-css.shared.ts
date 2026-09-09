import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  commandContracts,
  DomainCssEditPayloadSchema,
  DomainCssGetStatePayloadSchema,
  DomainCssRemovePayloadSchema,
  DomainCssStateSchema,
  DomainCssTogglePayloadSchema,
  DomainNavigationGetStatePayloadSchema,
  DomainNavigationSetPayloadSchema,
  DomainNavigationStateSchema,
  DomainSettingsOpenPayloadSchema,
  NavigationBlockRuleSchema,
} from "./domain-css.contracts";

// ── Command names ────────────────────────────────────────────────
export const DOMAIN_SETTINGS_OPEN = "domain-settings:open" as const;
export const DOMAIN_CSS_TOGGLE = "domain-css:toggle" as const;
export const DOMAIN_CSS_EDIT = "domain-css:edit" as const;
export const DOMAIN_CSS_REMOVE = "domain-css:remove" as const;
export const DOMAIN_CSS_GET_STATE = "domain-css:get-state" as const;
export const DOMAIN_NAVIGATION_SET = "domain-navigation:set" as const;
export const DOMAIN_NAVIGATION_GET_STATE = "domain-navigation:get-state" as const;

// ── Event names ──────────────────────────────────────────────────
export const DOMAIN_CSS_CHANGED = "domain-css:changed" as const;
export const DOMAIN_NAVIGATION_CHANGED = "domain-navigation:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type DomainCssState = z.infer<typeof DomainCssStateSchema>;

export type NavigationBlockRule = z.infer<typeof NavigationBlockRuleSchema>;

export const DEFAULT_NAVIGATION_BLOCK_RULE: NavigationBlockRule = {
  enabled: false,
  crossOriginOnly: false,
};

export type DomainNavigationState = z.infer<typeof DomainNavigationStateSchema>;

export const DEFAULT_DOMAIN_NAVIGATION_STATE: Omit<DomainNavigationState, "domain"> = {
  blockNavigate: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockRedirect: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockFrameNavigate: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockNewTabs: false,
  blockNewWindows: false,
};

// ── Payload types ────────────────────────────────────────────────
export type DomainSettingsOpenPayload = z.infer<typeof DomainSettingsOpenPayloadSchema>;

export type DomainCssTogglePayload = z.infer<typeof DomainCssTogglePayloadSchema>;

export type DomainCssEditPayload = z.infer<typeof DomainCssEditPayloadSchema>;

export type DomainCssRemovePayload = z.infer<typeof DomainCssRemovePayloadSchema>;

export type DomainCssGetStatePayload = z.infer<typeof DomainCssGetStatePayloadSchema>;

export type DomainNavigationSetPayload = z.infer<typeof DomainNavigationSetPayloadSchema>;

export type DomainNavigationGetStatePayload = z.infer<typeof DomainNavigationGetStatePayloadSchema>;

export interface DomainCssChangedEvent {
  domain: string;
  enabled: boolean;
  hasFile: boolean;
}

export interface DomainNavigationChangedEvent {
  domain: string;
  blockNavigate: NavigationBlockRule;
  blockRedirect: NavigationBlockRule;
  blockFrameNavigate: NavigationBlockRule;
  blockNewTabs: boolean;
  blockNewWindows: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type DomainCssCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type DomainCssEvents = {
  [DOMAIN_CSS_CHANGED]: DomainCssChangedEvent;
  [DOMAIN_NAVIGATION_CHANGED]: DomainNavigationChangedEvent;
};

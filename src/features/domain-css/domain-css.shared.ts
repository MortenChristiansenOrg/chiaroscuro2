import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const DOMAIN_SETTINGS_OPEN = "domain-settings:open" as const;
export const DOMAIN_CSS_TOGGLE = "domain-css:toggle" as const;
export const DOMAIN_CSS_EDIT = "domain-css:edit" as const;
export const DOMAIN_CSS_REMOVE = "domain-css:remove" as const;
export const DOMAIN_CSS_GET_STATE = "domain-css:get-state" as const;

// ── Event names ──────────────────────────────────────────────────
export const DOMAIN_CSS_CHANGED = "domain-css:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface DomainCssState {
  domain: string;
  enabled: boolean;
  hasFile: boolean;
}

// ── Payload types ────────────────────────────────────────────────
export interface DomainSettingsOpenPayload {
  domain: string;
}

export interface DomainCssTogglePayload {
  domain: string;
}

export interface DomainCssEditPayload {
  domain: string;
}

export interface DomainCssRemovePayload {
  domain: string;
}

export interface DomainCssGetStatePayload {
  domain: string;
}

export interface DomainCssChangedEvent {
  domain: string;
  enabled: boolean;
  hasFile: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type DomainCssCommands = {
  [DOMAIN_SETTINGS_OPEN]: { payload: DomainSettingsOpenPayload; response: TabId };
  [DOMAIN_CSS_TOGGLE]: { payload: DomainCssTogglePayload; response: undefined };
  [DOMAIN_CSS_EDIT]: { payload: DomainCssEditPayload; response: undefined };
  [DOMAIN_CSS_REMOVE]: { payload: DomainCssRemovePayload; response: undefined };
  [DOMAIN_CSS_GET_STATE]: { payload: DomainCssGetStatePayload; response: DomainCssState };
};

// ── Event registry ───────────────────────────────────────────────
export type DomainCssEvents = {
  [DOMAIN_CSS_CHANGED]: DomainCssChangedEvent;
};

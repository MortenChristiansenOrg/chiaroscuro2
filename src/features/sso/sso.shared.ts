// ── Command names ────────────────────────────────────────────────
export const SSO_GET = "sso:get" as const;
export const SSO_SAVE = "sso:save" as const;

// ── Event names ──────────────────────────────────────────────────
export const SSO_CHANGED = "sso:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface SsoSettings {
  windowsAuth: boolean;
  azureAd: boolean;
}

export interface SsoState {
  settings: SsoSettings;
  bootState: SsoSettings;
  isWindows: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type SsoCommands = {
  [SSO_GET]: { payload: undefined; response: SsoState };
  [SSO_SAVE]: { payload: SsoSettings; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type SsoEvents = {
  [SSO_CHANGED]: SsoState;
};

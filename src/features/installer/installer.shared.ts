// ── Command names ────────────────────────────────────────────────
export const INSTALLER_CHECK_FOR_UPDATES = "installer:check-for-updates" as const;
export const INSTALLER_APPLY_UPDATE = "installer:apply-update" as const;
export const INSTALLER_DISMISS_UPDATE = "installer:dismiss-update" as const;
export const INSTALLER_ALLOW_PROTOCOL = "installer:allow-protocol" as const;
export const INSTALLER_DENY_PROTOCOL = "installer:deny-protocol" as const;

// ── Event names ──────────────────────────────────────────────────
export const INSTALLER_UPDATE_AVAILABLE = "installer:update-available" as const;
export const INSTALLER_UPDATE_DOWNLOADED = "installer:update-downloaded" as const;
export const INSTALLER_UPDATE_NOT_AVAILABLE = "installer:update-not-available" as const;
export const INSTALLER_UPDATE_ERROR = "installer:update-error" as const;
export const INSTALLER_PROTOCOL_LAUNCH_REQUESTED = "installer:protocol-launch-requested" as const;
export const INSTALLER_UPDATE_DISMISSED = "installer:update-dismissed" as const;
export const INSTALLER_PROTOCOL_ALLOWED = "installer:protocol-allowed" as const;

// ── Command payloads ─────────────────────────────────────────────
export interface AllowProtocolPayload {
  protocol: string;
  origin: string;
  url: string;
  always: boolean;
}

export interface DenyProtocolPayload {
  protocol: string;
  origin: string;
  url: string;
}

// ── Event payloads ───────────────────────────────────────────────
export interface UpdateAvailableEvent {
  version: string;
}

export interface UpdateDownloadedEvent {
  version: string;
}

export interface UpdateErrorEvent {
  message: string;
}

export interface ProtocolLaunchRequestedEvent {
  protocol: string;
  origin: string;
  url: string;
}

export interface ProtocolAllowedEvent {
  protocol: string;
  origin: string;
  always: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type InstallerCommands = {
  [INSTALLER_CHECK_FOR_UPDATES]: { payload: undefined; response: undefined };
  [INSTALLER_APPLY_UPDATE]: { payload: undefined; response: undefined };
  [INSTALLER_DISMISS_UPDATE]: { payload: undefined; response: undefined };
  [INSTALLER_ALLOW_PROTOCOL]: { payload: AllowProtocolPayload; response: undefined };
  [INSTALLER_DENY_PROTOCOL]: { payload: DenyProtocolPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type InstallerEvents = {
  [INSTALLER_UPDATE_AVAILABLE]: UpdateAvailableEvent;
  [INSTALLER_UPDATE_DOWNLOADED]: UpdateDownloadedEvent;
  [INSTALLER_UPDATE_NOT_AVAILABLE]: undefined;
  [INSTALLER_UPDATE_ERROR]: UpdateErrorEvent;
  [INSTALLER_PROTOCOL_LAUNCH_REQUESTED]: ProtocolLaunchRequestedEvent;
  [INSTALLER_UPDATE_DISMISSED]: undefined;
  [INSTALLER_PROTOCOL_ALLOWED]: ProtocolAllowedEvent;
};

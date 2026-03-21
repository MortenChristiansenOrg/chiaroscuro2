// ── Command names ────────────────────────────────────────────────
export const PERMISSIONS_SET = "permissions:set" as const;
export const PERMISSIONS_REVOKE = "permissions:revoke" as const;
export const PERMISSIONS_GET_DOMAIN = "permissions:get-domain-permissions" as const;

// ── Event names ──────────────────────────────────────────────────
export const PERMISSIONS_CHANGED = "permissions:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type PermissionDecision = "allow" | "deny";

export interface DomainPermissions {
  domain: string;
  permissions: Record<string, PermissionDecision>;
}

// ── Payload types ────────────────────────────────────────────────
export interface PermissionsSetPayload {
  domain: string;
  permission: string;
  decision: PermissionDecision;
}

export interface PermissionsRevokePayload {
  domain: string;
  permission: string;
}

export interface PermissionsGetDomainPayload {
  domain: string;
}

// ── Event payloads ───────────────────────────────────────────────
export interface PermissionsChangedEvent {
  domain: string;
  permissions: Record<string, PermissionDecision>;
}

// ── Command registry ─────────────────────────────────────────────
export type PermissionsCommands = {
  [PERMISSIONS_SET]: { payload: PermissionsSetPayload; response: undefined };
  [PERMISSIONS_REVOKE]: { payload: PermissionsRevokePayload; response: undefined };
  [PERMISSIONS_GET_DOMAIN]: { payload: PermissionsGetDomainPayload; response: DomainPermissions };
};

// ── Event registry ───────────────────────────────────────────────
export type PermissionsEvents = {
  [PERMISSIONS_CHANGED]: PermissionsChangedEvent;
};

// ── Human-readable permission labels ─────────────────────────────
export const PERMISSION_INFO: Record<string, { label: string; icon: string }> = {
  geolocation: { label: "Location", icon: "location-dot" },
  camera: { label: "Camera", icon: "video" },
  microphone: { label: "Microphone", icon: "microphone" },
  "display-capture": { label: "Screen Sharing", icon: "display" },
  notifications: { label: "Notifications", icon: "bell" },
  "clipboard-read": { label: "Clipboard Read", icon: "clipboard" },
  "clipboard-sanitized-write": { label: "Clipboard Write", icon: "clipboard" },
  midi: { label: "MIDI Devices", icon: "music" },
  midiSysex: { label: "MIDI System Exclusive", icon: "music" },
  pointerLock: { label: "Pointer Lock", icon: "arrows-up-down-left-right" },
  keyboardLock: { label: "Keyboard Lock", icon: "keyboard" },
  fullscreen: { label: "Fullscreen", icon: "expand" },
  "idle-detection": { label: "Idle Detection", icon: "clock" },
  "speaker-selection": { label: "Speaker Selection", icon: "volume-high" },
  "storage-access": { label: "Storage Access", icon: "database" },
  "top-level-storage-access": { label: "Top-level Storage Access", icon: "database" },
  "window-management": { label: "Window Management", icon: "window-restore" },
  mediaKeySystem: { label: "Protected Content (DRM)", icon: "shield-halved" },
  usb: { label: "USB Devices", icon: "plug" },
  serial: { label: "Serial Ports", icon: "plug-circle-bolt" },
  hid: { label: "HID Devices", icon: "gamepad" },
  bluetooth: { label: "Bluetooth", icon: "tower-broadcast" },
  fileSystem: { label: "File System Access", icon: "folder-open" },
  "persistent-storage": { label: "Persistent Storage", icon: "hard-drive" },
  openExternal: { label: "Open External Links", icon: "arrow-up-right-from-square" },
  unknown: { label: "Unknown Permission", icon: "question" },
};

export function getPermissionInfo(permission: string): { label: string; icon: string } {
  return PERMISSION_INFO[permission] ?? { label: permission, icon: "question" };
}

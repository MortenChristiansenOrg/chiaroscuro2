import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  commandContracts,
  DomainPermissionsSchema,
  PermissionDecisionSchema,
  PermissionsGetDomainPayloadSchema,
  PermissionsRevokePayloadSchema,
  PermissionsSetPayloadSchema,
} from "./permissions.contracts";
// ── Command names ────────────────────────────────────────────────
export const PERMISSIONS_SET = "permissions:set" as const;
export const PERMISSIONS_REVOKE = "permissions:revoke" as const;
export const PERMISSIONS_GET_DOMAIN = "permissions:get-domain-permissions" as const;

// ── Event names ──────────────────────────────────────────────────
export const PERMISSIONS_GET_GLOBAL = "permissions:get-global";
export const PERMISSIONS_SET_GLOBAL = "permissions:set-global";
export const PERMISSIONS_RESET_GLOBAL = "permissions:reset-global";
export const PERMISSIONS_GLOBAL_CHANGED = "permissions:global-changed";

export const PERMISSIONS_CHANGED = "permissions:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export type DomainPermissions = z.infer<typeof DomainPermissionsSchema>;

// ── Payload types ────────────────────────────────────────────────
export type PermissionsSetPayload = z.infer<typeof PermissionsSetPayloadSchema>;

export type PermissionsRevokePayload = z.infer<typeof PermissionsRevokePayloadSchema>;

export type PermissionsGetDomainPayload = z.infer<typeof PermissionsGetDomainPayloadSchema>;

// ── Event payloads ───────────────────────────────────────────────
export interface PermissionsChangedEvent {
  domain: string;
  permissions: Record<string, PermissionDecision>;
}

// ── Command registry ─────────────────────────────────────────────
export type PermissionsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type GlobalPermissions = {
  permissions: Record<string, PermissionDecision>;
  availablePermissions: string[];
};

export type PermissionsEvents = {
  [PERMISSIONS_GLOBAL_CHANGED]: GlobalPermissions;
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
  ar: { label: "Augmented Reality", icon: "eye" },
  vr: { label: "Virtual Reality", icon: "eye" },
  "automatic-fullscreen": { label: "Automatic Fullscreen", icon: "expand" },
  "background-fetch": { label: "Background Fetch", icon: "download" },
  "background-sync": { label: "Background Sync", icon: "rotate" },
  "captured-surface-control": { label: "Captured Surface Control", icon: "display" },
  "deprecated-sync-clipboard-read": { label: "Synchronous Clipboard Read", icon: "clipboard" },
  "geolocation-approximate": { label: "Approximate Location", icon: "location-dot" },
  "hand-tracking": { label: "Hand Tracking", icon: "hand" },
  "local-fonts": { label: "Local Fonts", icon: "font" },
  "local-network": { label: "Local Network", icon: "network-wired" },
  "local-network-access": { label: "Local Network Access", icon: "network-wired" },
  "loopback-network": { label: "Loopback Network", icon: "network-wired" },
  nfc: { label: "NFC", icon: "wifi" },
  "payment-handler": { label: "Payment Handler", icon: "credit-card" },
  "periodic-background-sync": { label: "Periodic Background Sync", icon: "rotate" },
  "screen-wake-lock": { label: "Screen Wake Lock", icon: "display" },
  sensors: { label: "Sensors", icon: "gauge" },
  "smart-card": { label: "Smart Card", icon: "credit-card" },
  "system-wake-lock": { label: "System Wake Lock", icon: "power-off" },
  "web-app-installation": { label: "Web App Installation", icon: "download" },
  "web-printing": { label: "Web Printing", icon: "print" },
  unknown: { label: "Unknown Permission", icon: "question" },
};

export function getPermissionInfo(permission: string): { label: string; icon: string } {
  return PERMISSION_INFO[permission] ?? { label: permission, icon: "question" };
}

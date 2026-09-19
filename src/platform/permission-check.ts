import type { TabId } from "../shared/types";
import type { Platform } from "./types";

type PermissionCheckHandler = Parameters<Platform["onPermissionCheck"]>[0];

/** Forward origin-based checks even when Electron has no associated WebContents. */
export function checkPermission<T>(
  webContents: T | null,
  permission: string,
  origin: string,
  details: { mediaType?: string },
  resolveTab: (contents: T) => TabId | undefined,
  handler: PermissionCheckHandler | undefined,
): boolean {
  if (!handler) return false;
  const tabId = webContents ? resolveTab(webContents) : null;
  if (webContents && !tabId) return false;
  return handler(tabId ?? null, permission, origin, details);
}

/** Grants live only in memory: match Electron's unique device/port ID, never its type alone. */
export function matchesGrantedDevice(type: string, granted: unknown, requested: unknown): boolean {
  if (!granted || !requested || typeof granted !== "object" || typeof requested !== "object") {
    return false;
  }
  const saved = granted as Record<string, unknown>;
  const device = requested as Record<string, unknown>;
  const idKey = type === "serial" ? "portId" : "deviceId";
  const id = saved[idKey];
  if (typeof id !== "string" || !id || id !== device[idKey]) return false;
  // A physical HID device can expose several independently selected interfaces.
  if (type === "hid" && (saved.guid || device.guid)) return saved.guid === device.guid;
  return true;
}

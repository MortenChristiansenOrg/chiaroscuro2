import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId } from "../../shared/types";
import {
  PERMISSIONS_CHANGED,
  PERMISSIONS_GET_DOMAIN,
  PERMISSIONS_REVOKE,
  PERMISSIONS_SET,
  type PermissionDecision,
  type PermissionsCommands,
  type PermissionsEvents,
  getPermissionInfo,
} from "./permissions.shared";

type AllCommands = PermissionsCommands;
type AllEvents = PermissionsEvents;

export interface PermissionsDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
}

const SETTINGS_KEY = "permissions-decisions";

/** Device-type permissions that map to device selection handlers. */
const DEVICE_PERMISSIONS = new Set(["usb", "serial", "hid", "bluetooth"]);

// domain → (permission → decision)
let decisions = new Map<string, Map<string, PermissionDecision>>();

let deps: PermissionsDeps;

function getDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function getDecision(domain: string, permission: string): PermissionDecision | undefined {
  return decisions.get(domain)?.get(permission);
}

function setDecision(domain: string, permission: string, decision: PermissionDecision): void {
  let domainMap = decisions.get(domain);
  if (!domainMap) {
    domainMap = new Map();
    decisions.set(domain, domainMap);
  }
  domainMap.set(permission, decision);
}

function removeDecision(domain: string, permission: string): void {
  const domainMap = decisions.get(domain);
  if (!domainMap) return;
  domainMap.delete(permission);
  if (domainMap.size === 0) decisions.delete(domain);
}

function getDomainPermissions(domain: string): Record<string, PermissionDecision> {
  const domainMap = decisions.get(domain);
  if (!domainMap) return {};
  return Object.fromEntries(domainMap);
}

async function persistDecisions(): Promise<void> {
  const serializable: Record<string, Record<string, PermissionDecision>> = {};
  for (const [domain, domainMap] of decisions) {
    serializable[domain] = Object.fromEntries(domainMap);
  }
  try {
    await deps.dataStore.setSetting(SETTINGS_KEY, serializable);
  } catch (error) {
    console.error("Failed to persist permission decisions", error);
  }
}

function emitChanged(domain: string): void {
  deps.events.emit(PERMISSIONS_CHANGED, {
    domain,
    permissions: getDomainPermissions(domain),
  });
}

// ── Media permission normalization ────────────────────────────────

/** Normalize Electron's `media` permission into `camera`/`microphone` keys. */
function normalizeMediaKeys(mediaTypes?: string[]): string[] {
  if (!mediaTypes || mediaTypes.length === 0) return ["camera", "microphone"];
  const keys: string[] = [];
  if (mediaTypes.includes("video")) keys.push("camera");
  if (mediaTypes.includes("audio")) keys.push("microphone");
  return keys.length > 0 ? keys : ["camera", "microphone"];
}

function mediaCheckKey(mediaType?: string): string {
  if (mediaType === "video") return "camera";
  if (mediaType === "audio") return "microphone";
  return "camera"; // fallback
}

/** Build the prompt label for one or more media keys. */
function mediaLabel(keys: string[]): string {
  if (keys.length >= 2) return "Camera & Microphone";
  return keys[0] ? getPermissionInfo(keys[0]).label : "Camera & Microphone";
}

export default defineFeature<PermissionsDeps>({
  register(d_) {
    deps = d_;
    decisions = new Map();

    const { commands, platform } = d_;

    // ── Permission request handler (async — shows native dialog) ──
    platform.onPermissionRequest(async (_tabId: TabId, permission: string, details) => {
      const domain = getDomainFromUrl(details.requestingUrl);
      if (!domain) return false;

      // Normalize `media` into camera/microphone keys
      if (permission === "media") {
        const keys = normalizeMediaKeys(details.mediaTypes);

        // If all keys have stored decisions, use them
        const storedAll = keys.map((k) => getDecision(domain, k));
        if (storedAll.every((d) => d !== undefined)) {
          return storedAll.every((d) => d === "allow");
        }

        // Prompt for undecided keys
        const undecided = keys.filter((k) => getDecision(domain, k) === undefined);
        const label = mediaLabel(undecided);
        const allowed = await platform.showPermissionPrompt(domain, label);
        const decision: PermissionDecision = allowed ? "allow" : "deny";
        for (const k of undecided) setDecision(domain, k, decision);
        persistDecisions().catch(console.error);
        emitChanged(domain);

        // Grant only if ALL keys are now "allow"
        return keys.every((k) => getDecision(domain, k) === "allow");
      }

      // Non-media: standard path
      const stored = getDecision(domain, permission);
      if (stored) return stored === "allow";

      const info = getPermissionInfo(permission);
      const allowed = await platform.showPermissionPrompt(domain, info.label);
      const decision: PermissionDecision = allowed ? "allow" : "deny";
      setDecision(domain, permission, decision);
      persistDecisions().catch(console.error);
      emitChanged(domain);
      return allowed;
    });

    // ── Permission check handler (sync — stored decisions only) ──
    platform.onPermissionCheck(
      (_tabId: TabId, permission: string, requestingOrigin: string, details) => {
        const domain = getDomainFromUrl(requestingOrigin);
        if (!domain) return false;

        if (permission === "media") {
          const key = mediaCheckKey(details?.mediaType);
          return getDecision(domain, key) === "allow";
        }

        return getDecision(domain, permission) === "allow";
      },
    );

    // ── Device selection callback ─────────────────────────────────
    platform.onDeviceSelected((deviceType: string, origin: string) => {
      const domain = getDomainFromUrl(origin);
      if (!domain) return;
      setDecision(domain, deviceType, "allow");
      persistDecisions().catch(console.error);
      emitChanged(domain);
    });

    // ── Commands ──────────────────────────────────────────────────

    commands.handle(PERMISSIONS_SET, async (payload) => {
      const { domain, permission, decision } = payload;
      setDecision(domain, permission, decision);
      await persistDecisions();
      emitChanged(domain);
    });

    commands.handle(PERMISSIONS_REVOKE, async (payload) => {
      const { domain, permission } = payload;
      removeDecision(domain, permission);
      await persistDecisions();
      // Clear platform-side device grants when revoking a device permission
      if (DEVICE_PERMISSIONS.has(permission)) {
        platform.clearDevicePermissions(domain, permission);
      }
      emitChanged(domain);
    });

    commands.handle(PERMISSIONS_GET_DOMAIN, async (payload) => {
      const { domain } = payload;
      return {
        domain,
        permissions: getDomainPermissions(domain),
      };
    });
  },

  async start({ dataStore }) {
    const stored =
      await dataStore.getSetting<Record<string, Record<string, PermissionDecision>>>(SETTINGS_KEY);
    if (stored) {
      for (const [domain, perms] of Object.entries(stored)) {
        const domainMap = new Map<string, PermissionDecision>();
        for (const [perm, decision] of Object.entries(perms)) {
          domainMap.set(perm, decision);
        }
        decisions.set(domain, domainMap);
      }
    }
  },

  teardown() {
    decisions.clear();
  },
});

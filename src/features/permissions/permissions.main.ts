import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId } from "../../shared/types";
import {
  type GlobalPermissions,
  getPermissionInfo,
  PERMISSION_INFO,
  PERMISSIONS_CHANGED,
  PERMISSIONS_GET_DOMAIN,
  PERMISSIONS_GET_GLOBAL,
  PERMISSIONS_GLOBAL_CHANGED,
  PERMISSIONS_RESET_GLOBAL,
  PERMISSIONS_REVOKE,
  PERMISSIONS_SET,
  PERMISSIONS_SET_GLOBAL,
  type PermissionDecision,
  type PermissionsCommands,
  type PermissionsEvents,
} from "./permissions.shared";

type AllCommands = PermissionsCommands;
type AllEvents = PermissionsEvents;

export interface PermissionsDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
}

const GLOBAL_SETTINGS_KEY = "permissions-global-decisions";
let globalDecisions = new Map<string, PermissionDecision>();

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
  return globalDecisions.get(permission) ?? decisions.get(domain)?.get(permission);
}

function getGlobalPermissions(): GlobalPermissions {
  return {
    permissions: Object.fromEntries(globalDecisions),
    availablePermissions: [
      ...new Set([
        ...Object.keys(PERMISSION_INFO),
        ...globalDecisions.keys(),
        ...[...decisions.values()].flatMap((perms) => [...perms.keys()]),
      ]),
    ],
  };
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

/** Build the prompt label for one or more media keys. */
function mediaLabel(keys: string[]): string {
  if (keys.length >= 2) return "Camera & Microphone";
  return keys[0] ? getPermissionInfo(keys[0]).label : "Camera & Microphone";
}

export default defineFeature<PermissionsDeps>({
  register(d_) {
    deps = d_;
    decisions = new Map();
    globalDecisions = new Map();

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
        if (storedAll.includes("deny")) return false;
        if (storedAll.every((d) => d !== undefined)) {
          return storedAll.every((d) => d === "allow");
        }

        // Prompt for undecided keys
        const undecided = keys.filter((k) => getDecision(domain, k) === undefined);
        const label = mediaLabel(undecided);
        const allowed = await platform.showPermissionPrompt(domain, label);
        const decision: PermissionDecision = allowed ? "allow" : "deny";
        for (const k of undecided) {
          if (!globalDecisions.has(k)) setDecision(domain, k, decision);
        }
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
      if (!globalDecisions.has(permission)) setDecision(domain, permission, decision);
      persistDecisions().catch(console.error);
      emitChanged(domain);
      return getDecision(domain, permission) === "allow";
    });

    // ── Permission check handler (sync — stored decisions only) ──
    platform.onPermissionCheck(
      (_tabId: TabId | null, permission: string, requestingOrigin: string, details) => {
        const domain = getDomainFromUrl(requestingOrigin);
        if (!domain) return false;

        if (permission === "media") {
          const keys = normalizeMediaKeys(details?.mediaType ? [details.mediaType] : undefined);
          return keys.every((key) => getDecision(domain, key) === "allow");
        }

        return getDecision(domain, permission) === "allow";
      },
    );

    // ── Device selection callback ─────────────────────────────────
    platform.onDeviceSelected((deviceType: string, origin: string) => {
      const domain = getDomainFromUrl(origin);
      if (!domain || globalDecisions.has(deviceType)) return;
      setDecision(domain, deviceType, "allow");
      persistDecisions().catch(console.error);
      emitChanged(domain);
    });

    // ── Commands ──────────────────────────────────────────────────

    // Serialize global writes so rapid changes cannot persist an older snapshot last.
    let globalWrite: Promise<void> = Promise.resolve();
    function changeGlobal(permission: string, decision?: PermissionDecision): Promise<void> {
      const write = globalWrite.then(async () => {
        const next = new Map(globalDecisions);
        if (decision) next.set(permission, decision);
        else next.delete(permission);
        await deps.dataStore.setSetting(GLOBAL_SETTINGS_KEY, Object.fromEntries(next));
        globalDecisions = next;
        deps.events.emit(PERMISSIONS_GLOBAL_CHANGED, getGlobalPermissions());
      });
      globalWrite = write.catch(() => {});
      return write;
    }

    commands.handle(PERMISSIONS_GET_GLOBAL, async () => getGlobalPermissions());
    commands.handle(PERMISSIONS_SET_GLOBAL, ({ permission, decision }) =>
      changeGlobal(permission, decision),
    );
    commands.handle(PERMISSIONS_RESET_GLOBAL, ({ permission }) => changeGlobal(permission));

    commands.handle(PERMISSIONS_SET, async (payload) => {
      const { domain, permission, decision } = payload;
      if (globalDecisions.has(permission))
        throw new Error("This permission is managed in Settings.");
      setDecision(domain, permission, decision);
      await persistDecisions();
      emitChanged(domain);
    });

    commands.handle(PERMISSIONS_REVOKE, async (payload) => {
      const { domain, permission } = payload;
      if (globalDecisions.has(permission))
        throw new Error("This permission is managed in Settings.");
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
    const global =
      await dataStore.getSetting<Record<string, PermissionDecision>>(GLOBAL_SETTINGS_KEY);
    globalDecisions = new Map(Object.entries(global ?? {}));
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
    globalDecisions.clear();
  },
});

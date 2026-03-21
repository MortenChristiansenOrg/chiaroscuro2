import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import type { PermissionsDeps } from "./permissions.main";
import feature from "./permissions.main";
import {
  PERMISSIONS_CHANGED,
  PERMISSIONS_GET_DOMAIN,
  PERMISSIONS_REVOKE,
  PERMISSIONS_SET,
  type PermissionsCommands,
  type PermissionsEvents,
} from "./permissions.shared";

type AllCommands = PermissionsCommands;
type AllEvents = PermissionsEvents;

// Capture the handler registered via platform.onPermissionRequest
let permissionRequestHandler:
  | ((
      tabId: TabId,
      permission: string,
      details: { requestingUrl: string; isMainFrame: boolean; mediaTypes?: string[] },
    ) => Promise<boolean>)
  | undefined;

let permissionCheckHandler:
  | ((
      tabId: TabId,
      permission: string,
      requestingOrigin: string,
      details: { mediaType?: string },
    ) => boolean)
  | undefined;

let deviceSelectedCallback: ((deviceType: string, origin: string) => void) | undefined;

function setup(promptResponse = false) {
  permissionRequestHandler = undefined;
  permissionCheckHandler = undefined;
  deviceSelectedCallback = undefined;

  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const platform = createMockPlatform({
    onPermissionRequest: vi.fn((handler) => {
      permissionRequestHandler = handler;
    }),
    onPermissionCheck: vi.fn((handler) => {
      permissionCheckHandler = handler;
    }),
    onDeviceSelected: vi.fn((cb) => {
      deviceSelectedCallback = cb;
    }),
    showPermissionPrompt: vi.fn(async () => promptResponse),
  });

  const deps: PermissionsDeps = { commands, events, platform, dataStore };
  feature.register(deps);
  return { commands, events, dataStore, platform, deps };
}

function cleanup() {
  feature.teardown?.();
}

describe("permissions", () => {
  afterEach(cleanup);

  describe("permission request handler", () => {
    it("registers handlers on platform", () => {
      const { platform } = setup();
      expect(platform.onPermissionRequest).toHaveBeenCalled();
      expect(platform.onPermissionCheck).toHaveBeenCalled();
      expect(platform.onDeviceSelected).toHaveBeenCalled();
      expect(permissionRequestHandler).toBeDefined();
      expect(permissionCheckHandler).toBeDefined();
      expect(deviceSelectedCallback).toBeDefined();
    });

    it("shows native dialog and denies when user denies", async () => {
      const { platform, events } = setup(false);
      const changedFn = vi.fn();
      events.on(PERMISSIONS_CHANGED, changedFn);

      const result = await permissionRequestHandler?.("tab-1" as TabId, "geolocation", {
        requestingUrl: "https://example.com/page",
        isMainFrame: true,
      });

      expect(result).toBe(false);
      expect(platform.showPermissionPrompt).toHaveBeenCalledWith("example.com", "Location");
      expect(changedFn).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "example.com",
          permissions: { geolocation: "deny" },
        }),
      );
    });

    it("shows native dialog and allows when user allows", async () => {
      const { platform } = setup(true);

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://meet.example.com/",
        isMainFrame: true,
        mediaTypes: ["video", "audio"],
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).toHaveBeenCalledWith(
        "meet.example.com",
        "Camera & Microphone",
      );
    });

    it("uses stored decision without showing dialog", async () => {
      const { commands, platform } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "example.com",
        permission: "geolocation",
        decision: "allow",
      });

      const result = await permissionRequestHandler?.("tab-1" as TabId, "geolocation", {
        requestingUrl: "https://example.com/page",
        isMainFrame: true,
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });

    it("uses stored deny decision without showing dialog", async () => {
      const { commands, platform } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "example.com",
        permission: "notifications",
        decision: "deny",
      });

      const result = await permissionRequestHandler?.("tab-1" as TabId, "notifications", {
        requestingUrl: "https://example.com/",
        isMainFrame: true,
      });

      expect(result).toBe(false);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });

    it("denies for invalid URLs without showing dialog", async () => {
      const { platform } = setup();
      const result = await permissionRequestHandler?.("tab-1" as TabId, "geolocation", {
        requestingUrl: "not-a-url",
        isMainFrame: true,
      });
      expect(result).toBe(false);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });

    it("persists dialog decision to DataStore", async () => {
      const { dataStore } = setup(true);

      await permissionRequestHandler?.("tab-1" as TabId, "geolocation", {
        requestingUrl: "https://example.com/",
        isMainFrame: true,
      });

      const stored =
        await dataStore.getSetting<Record<string, Record<string, string>>>("permissions-decisions");
      expect(stored).toEqual({ "example.com": { geolocation: "allow" } });
    });
  });

  describe("camera/microphone splitting", () => {
    it("splits media with video-only into camera permission", async () => {
      const { platform, events } = setup(true);
      const changedFn = vi.fn();
      events.on(PERMISSIONS_CHANGED, changedFn);

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://cam.example.com/",
        isMainFrame: true,
        mediaTypes: ["video"],
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).toHaveBeenCalledWith("cam.example.com", "Camera");
      expect(changedFn).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: { camera: "allow" },
        }),
      );
    });

    it("splits media with audio-only into microphone permission", async () => {
      const { platform, events } = setup(true);
      const changedFn = vi.fn();
      events.on(PERMISSIONS_CHANGED, changedFn);

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://mic.example.com/",
        isMainFrame: true,
        mediaTypes: ["audio"],
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).toHaveBeenCalledWith("mic.example.com", "Microphone");
      expect(changedFn).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: { microphone: "allow" },
        }),
      );
    });

    it("stores both camera and microphone for combined media request", async () => {
      const { dataStore } = setup(true);

      await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://meet.example.com/",
        isMainFrame: true,
        mediaTypes: ["video", "audio"],
      });

      const stored =
        await dataStore.getSetting<Record<string, Record<string, string>>>("permissions-decisions");
      expect(stored).toEqual({
        "meet.example.com": { camera: "allow", microphone: "allow" },
      });
    });

    it("uses stored camera/microphone decisions for media request", async () => {
      const { commands, platform } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "meet.com",
        permission: "camera",
        decision: "allow",
      });
      await commands.send(PERMISSIONS_SET, {
        domain: "meet.com",
        permission: "microphone",
        decision: "allow",
      });

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://meet.com/call",
        isMainFrame: true,
        mediaTypes: ["video", "audio"],
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });

    it("denies combined request when one is denied", async () => {
      const { commands, platform } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "meet.com",
        permission: "camera",
        decision: "allow",
      });
      await commands.send(PERMISSIONS_SET, {
        domain: "meet.com",
        permission: "microphone",
        decision: "deny",
      });

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://meet.com/call",
        isMainFrame: true,
        mediaTypes: ["video", "audio"],
      });

      expect(result).toBe(false);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });

    it("prompts for undecided media type when other is decided", async () => {
      const { commands, platform } = setup(true);

      // Camera already allowed, microphone undecided
      await commands.send(PERMISSIONS_SET, {
        domain: "meet.com",
        permission: "camera",
        decision: "allow",
      });

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://meet.com/call",
        isMainFrame: true,
        mediaTypes: ["video", "audio"],
      });

      expect(result).toBe(true);
      // Should only prompt for microphone
      expect(platform.showPermissionPrompt).toHaveBeenCalledWith("meet.com", "Microphone");
    });

    it("treats media without mediaTypes as camera+microphone", async () => {
      const { platform } = setup(true);

      await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://legacy.com/",
        isMainFrame: true,
      });

      expect(platform.showPermissionPrompt).toHaveBeenCalledWith(
        "legacy.com",
        "Camera & Microphone",
      );
    });
  });

  describe("permission check handler", () => {
    it("returns true for allowed permission", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "check.com",
        permission: "geolocation",
        decision: "allow",
      });

      const result = permissionCheckHandler?.(
        "tab-1" as TabId,
        "geolocation",
        "https://check.com",
        {},
      );
      expect(result).toBe(true);
    });

    it("returns false for denied permission", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "check.com",
        permission: "geolocation",
        decision: "deny",
      });

      const result = permissionCheckHandler?.(
        "tab-1" as TabId,
        "geolocation",
        "https://check.com",
        {},
      );
      expect(result).toBe(false);
    });

    it("returns false for unknown permission", () => {
      setup();
      const result = permissionCheckHandler?.(
        "tab-1" as TabId,
        "geolocation",
        "https://unknown.com",
        {},
      );
      expect(result).toBe(false);
    });

    it("returns false for invalid origin", () => {
      setup();
      const result = permissionCheckHandler?.(
        "tab-1" as TabId,
        "geolocation",
        "invalid-origin",
        {},
      );
      expect(result).toBe(false);
    });

    it("checks camera for media permission with video mediaType", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "check.com",
        permission: "camera",
        decision: "allow",
      });

      const result = permissionCheckHandler?.("tab-1" as TabId, "media", "https://check.com", {
        mediaType: "video",
      });
      expect(result).toBe(true);
    });

    it("checks microphone for media permission with audio mediaType", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "check.com",
        permission: "microphone",
        decision: "allow",
      });

      const result = permissionCheckHandler?.("tab-1" as TabId, "media", "https://check.com", {
        mediaType: "audio",
      });
      expect(result).toBe(true);
    });

    it("camera check does not grant microphone", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "check.com",
        permission: "camera",
        decision: "allow",
      });

      const result = permissionCheckHandler?.("tab-1" as TabId, "media", "https://check.com", {
        mediaType: "audio",
      });
      expect(result).toBe(false);
    });
  });

  describe("device permissions", () => {
    it("stores device type permission when device selected", () => {
      const { events } = setup();
      const changedFn = vi.fn();
      events.on(PERMISSIONS_CHANGED, changedFn);

      deviceSelectedCallback?.("usb", "https://device.com");

      expect(changedFn).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "device.com",
          permissions: { usb: "allow" },
        }),
      );
    });

    it("clears platform device permissions on revoke", async () => {
      const { commands, platform } = setup();

      deviceSelectedCallback?.("usb", "https://device.com");

      await commands.send(PERMISSIONS_REVOKE, {
        domain: "device.com",
        permission: "usb",
      });

      expect(platform.clearDevicePermissions).toHaveBeenCalledWith("device.com", "usb");
    });

    it("does not call clearDevicePermissions for non-device permissions", async () => {
      const { commands, platform } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });
      await commands.send(PERMISSIONS_REVOKE, {
        domain: "test.com",
        permission: "geolocation",
      });

      expect(platform.clearDevicePermissions).not.toHaveBeenCalled();
    });
  });

  describe("PERMISSIONS_SET", () => {
    it("stores decision and emits changed event", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(PERMISSIONS_CHANGED, listener);

      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });

      expect(listener).toHaveBeenCalledWith({
        domain: "test.com",
        permissions: { geolocation: "allow" },
      });
    });

    it("persists to DataStore", async () => {
      const { commands, dataStore } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });

      const stored =
        await dataStore.getSetting<Record<string, Record<string, string>>>("permissions-decisions");
      expect(stored).toEqual({ "test.com": { geolocation: "allow" } });
    });

    it("handles multiple permissions per domain", async () => {
      const { commands } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });
      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "notifications",
        decision: "deny",
      });

      const state = await commands.send(PERMISSIONS_GET_DOMAIN, { domain: "test.com" });
      expect(state.permissions).toEqual({
        geolocation: "allow",
        notifications: "deny",
      });
    });
  });

  describe("PERMISSIONS_REVOKE", () => {
    it("removes decision and emits changed event", async () => {
      const { commands, events } = setup();

      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });

      const listener = vi.fn();
      events.on(PERMISSIONS_CHANGED, listener);

      await commands.send(PERMISSIONS_REVOKE, {
        domain: "test.com",
        permission: "geolocation",
      });

      expect(listener).toHaveBeenCalledWith({
        domain: "test.com",
        permissions: {},
      });
    });

    it("revoked permission triggers dialog on next request", async () => {
      const { commands, platform } = setup(false);

      // Set then revoke
      await commands.send(PERMISSIONS_SET, {
        domain: "test.com",
        permission: "geolocation",
        decision: "allow",
      });
      await commands.send(PERMISSIONS_REVOKE, {
        domain: "test.com",
        permission: "geolocation",
      });

      // Next request should show dialog
      await permissionRequestHandler?.("tab-1" as TabId, "geolocation", {
        requestingUrl: "https://test.com/",
        isMainFrame: true,
      });

      expect(platform.showPermissionPrompt).toHaveBeenCalled();
    });
  });

  describe("PERMISSIONS_GET_DOMAIN", () => {
    it("returns empty for unknown domain", async () => {
      const { commands } = setup();
      const state = await commands.send(PERMISSIONS_GET_DOMAIN, { domain: "unknown.com" });
      expect(state).toEqual({ domain: "unknown.com", permissions: {} });
    });
  });

  describe("start()", () => {
    it("loads persisted decisions", async () => {
      const { commands, deps, dataStore } = setup();

      await dataStore.setSetting("permissions-decisions", {
        "persisted.com": { geolocation: "allow", notifications: "deny" },
      });

      await feature.start?.(deps);

      const state = await commands.send(PERMISSIONS_GET_DOMAIN, { domain: "persisted.com" });
      expect(state.permissions).toEqual({
        geolocation: "allow",
        notifications: "deny",
      });
    });

    it("persisted allow decision is used without dialog", async () => {
      const { platform, deps, dataStore } = setup();

      await dataStore.setSetting("permissions-decisions", {
        "loaded.com": { camera: "allow" },
      });

      await feature.start?.(deps);

      const result = await permissionRequestHandler?.("tab-1" as TabId, "media", {
        requestingUrl: "https://loaded.com/",
        isMainFrame: true,
        mediaTypes: ["video"],
      });

      expect(result).toBe(true);
      expect(platform.showPermissionPrompt).not.toHaveBeenCalled();
    });
  });
});

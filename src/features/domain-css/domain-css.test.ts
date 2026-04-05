import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import type { DomainCssDeps } from "./domain-css.main";
import feature from "./domain-css.main";
import {
  DOMAIN_CSS_CHANGED,
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
  DOMAIN_NAVIGATION_CHANGED,
  DOMAIN_NAVIGATION_GET_STATE,
  DOMAIN_NAVIGATION_SET,
  DOMAIN_SETTINGS_OPEN,
  type DomainCssChangedEvent,
  type DomainCssCommands,
  type DomainCssEvents,
  type DomainNavigationChangedEvent,
} from "./domain-css.shared";

type AllCommands = DomainCssCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = DomainCssEvents & Pick<TabsEvents, "tabs:closed" | "tabs:updated">;

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "domain-css-test-"));
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const platform = createMockPlatform();
  const tabs = new Map<TabId, Tab>();

  const deps: DomainCssDeps = {
    commands,
    events,
    platform,
    dataStore,
    dataDir: tmpDir,
    getTabsSnapshot: () => tabs,
  };

  // Mock tabs:create and tabs:activate
  commands.handle("tabs:create", async (payload) => {
    return `mock-tab-${payload.url}` as TabId;
  });
  commands.handle("tabs:activate", async () => {});

  feature.register(deps);
  return { commands, events, dataStore, platform, deps, tabs };
}

function cleanup() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("domain-css commands", () => {
  afterEach(cleanup);

  describe("DOMAIN_CSS_GET_STATE", () => {
    it("returns disabled state for unknown domain", async () => {
      const { commands } = setup();
      const state = await commands.send(DOMAIN_CSS_GET_STATE, { domain: "example.com" });
      expect(state).toEqual({ domain: "example.com", enabled: false, hasFile: false });
    });
  });

  describe("DOMAIN_CSS_TOGGLE", () => {
    it("toggles enabled state and emits DOMAIN_CSS_CHANGED", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(DOMAIN_CSS_CHANGED, listener);

      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "example.com", enabled: true }),
      );

      // Toggle back
      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ domain: "example.com", enabled: false }),
      );
    });

    it("persists state to data store", async () => {
      const { commands, dataStore } = setup();
      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "test.com" });

      const stored =
        await dataStore.getSetting<Record<string, { enabled: boolean }>>("domain-css-states");
      expect(stored).toEqual({ "test.com": { enabled: true } });
    });

    it("injects CSS into all tabs on domain when enabled", async () => {
      const { commands, platform, tabs } = setup();
      const cssDir = path.join(tmpDir, "domain-css");
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(path.join(cssDir, "example.com.css"), "body { color: red; }");

      tabs.set(
        "tab-1" as TabId,
        {
          id: "tab-1" as TabId,
          url: "https://example.com/page",
        } as Tab,
      );
      tabs.set(
        "tab-2" as TabId,
        {
          id: "tab-2" as TabId,
          url: "https://other.com",
        } as Tab,
      );

      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });

      expect(platform.insertCSS).toHaveBeenCalledWith("tab-1", "body { color: red; }");
      expect(platform.insertCSS).not.toHaveBeenCalledWith("tab-2", expect.anything());
    });

    it("removes CSS from tabs when disabled", async () => {
      const { commands, platform, tabs } = setup();
      const cssDir = path.join(tmpDir, "domain-css");
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(path.join(cssDir, "example.com.css"), "body { color: red; }");

      tabs.set(
        "tab-1" as TabId,
        {
          id: "tab-1" as TabId,
          url: "https://example.com/page",
        } as Tab,
      );

      // Enable
      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
      expect(platform.insertCSS).toHaveBeenCalled();

      // Disable
      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "example.com" });
      expect(platform.removeInsertedCSS).toHaveBeenCalledWith("tab-1", "css-key");
    });
  });

  describe("DOMAIN_CSS_EDIT", () => {
    it("creates CSS file if not exists", async () => {
      const { commands } = setup();
      await commands.send(DOMAIN_CSS_EDIT, { domain: "new-domain.com" });

      const filePath = path.join(tmpDir, "domain-css", "new-domain.com.css");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("auto-enables CSS for the domain", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(DOMAIN_CSS_CHANGED, listener);

      await commands.send(DOMAIN_CSS_EDIT, { domain: "new-domain.com" });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "new-domain.com", enabled: true, hasFile: true }),
      );
    });

    it("opens file in system editor", async () => {
      const { commands, platform } = setup();
      await commands.send(DOMAIN_CSS_EDIT, { domain: "edit-test.com" });

      const expectedPath = path.join(tmpDir, "domain-css", "edit-test.com.css");
      expect(platform.openPath).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe("DOMAIN_CSS_REMOVE", () => {
    it("deletes CSS file and disables injection", async () => {
      const { commands, events } = setup();
      // First create a file
      await commands.send(DOMAIN_CSS_EDIT, { domain: "remove-test.com" });

      const listener = vi.fn();
      events.on(DOMAIN_CSS_CHANGED, listener);

      await commands.send(DOMAIN_CSS_REMOVE, { domain: "remove-test.com" });

      const filePath = path.join(tmpDir, "domain-css", "remove-test.com.css");
      expect(fs.existsSync(filePath)).toBe(false);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "remove-test.com", enabled: false, hasFile: false }),
      );
    });

    it("removes CSS from all tabs on domain", async () => {
      const { commands, platform, tabs } = setup();
      const cssDir = path.join(tmpDir, "domain-css");
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(path.join(cssDir, "rm.com.css"), "body{}");

      tabs.set(
        "tab-1" as TabId,
        {
          id: "tab-1" as TabId,
          url: "https://rm.com/page",
        } as Tab,
      );

      // Enable first
      await commands.send(DOMAIN_CSS_TOGGLE, { domain: "rm.com" });

      // Now remove
      await commands.send(DOMAIN_CSS_REMOVE, { domain: "rm.com" });

      expect(platform.removeInsertedCSS).toHaveBeenCalledWith("tab-1", "css-key");
    });
  });

  describe("DOMAIN_SETTINGS_OPEN", () => {
    it("creates a built-in tab for the domain", async () => {
      const { commands } = setup();
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-1" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(DOMAIN_SETTINGS_OPEN, { domain: "example.com" });

      expect(createSpy).toHaveBeenCalledWith({
        url: "app:domain-settings?domain=example.com",
      });
    });

    it("reactivates existing tab (singleton per domain)", async () => {
      const { commands } = setup();
      await commands.send(DOMAIN_SETTINGS_OPEN, { domain: "example.com" });

      // Second open should activate, not create
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-2" as TabId);
      commands.handle("tabs:create", createSpy);
      commands.unhandle("tabs:activate");
      const activateSpy = vi.fn(async () => {});
      commands.handle("tabs:activate", activateSpy);

      await commands.send(DOMAIN_SETTINGS_OPEN, { domain: "example.com" });
      expect(activateSpy).toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("creates new tab if singleton was closed", async () => {
      const { commands, events } = setup();
      await commands.send(DOMAIN_SETTINGS_OPEN, { domain: "example.com" });

      // Simulate tab close
      events.emit("tabs:closed", {
        tabId: "mock-tab-app:domain-settings?domain=example.com" as TabId,
        activatedTabId: null,
      });

      // Next open should create
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-2" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(DOMAIN_SETTINGS_OPEN, { domain: "example.com" });
      expect(createSpy).toHaveBeenCalled();
    });
  });

  describe("start()", () => {
    it("loads persisted states and starts watchers for enabled domains", async () => {
      const { deps, dataStore } = setup();
      const cssDir = path.join(tmpDir, "domain-css");
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(path.join(cssDir, "persisted.com.css"), "body{}");

      await dataStore.setSetting("domain-css-states", {
        "persisted.com": { enabled: true },
      });

      await feature.start?.(deps);

      // Get state should reflect persisted data
      const state = await deps.commands.send(DOMAIN_CSS_GET_STATE, { domain: "persisted.com" });
      expect(state).toEqual({ domain: "persisted.com", enabled: true, hasFile: true });
    });

    it("loads persisted navigation states", async () => {
      const { deps, dataStore } = setup();

      await dataStore.setSetting("domain-navigation-states", {
        "nav.com": {
          blockNavigate: { enabled: true, crossOriginOnly: true },
          blockRedirect: { enabled: false, crossOriginOnly: false },
          blockFrameNavigate: { enabled: false, crossOriginOnly: false },
          blockNewTabs: true,
          blockNewWindows: false,
        },
      });

      await feature.start?.(deps);

      const state = await deps.commands.send(DOMAIN_NAVIGATION_GET_STATE, { domain: "nav.com" });
      expect(state).toEqual({
        domain: "nav.com",
        blockNavigate: { enabled: true, crossOriginOnly: true },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: true,
        blockNewWindows: false,
      });
    });
  });

  describe("DOMAIN_NAVIGATION_SET", () => {
    const navSettings = {
      blockNavigate: { enabled: true, crossOriginOnly: true },
      blockRedirect: { enabled: true, crossOriginOnly: false },
      blockFrameNavigate: { enabled: false, crossOriginOnly: false },
      blockNewTabs: true,
      blockNewWindows: false,
    };

    it("sets navigation rules and emits DOMAIN_NAVIGATION_CHANGED", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(DOMAIN_NAVIGATION_CHANGED, listener);

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        ...navSettings,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "example.com", ...navSettings }),
      );
    });

    it("persists navigation state to data store", async () => {
      const { commands, dataStore } = setup();

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        ...navSettings,
      });

      const stored = await dataStore.getSetting<Record<string, unknown>>(
        "domain-navigation-states",
      );
      expect(stored).toMatchObject({
        "example.com": navSettings,
      });
    });

    it("removes from store when reset to defaults", async () => {
      const { commands, dataStore } = setup();

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        ...navSettings,
      });

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        blockNavigate: { enabled: false, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      });

      const stored = await dataStore.getSetting<Record<string, unknown>>(
        "domain-navigation-states",
      );
      expect(stored).toEqual({});
    });
  });

  describe("DOMAIN_NAVIGATION_GET_STATE", () => {
    it("returns defaults for unknown domain", async () => {
      const { commands } = setup();
      const state = await commands.send(DOMAIN_NAVIGATION_GET_STATE, { domain: "unknown.com" });
      expect(state).toEqual({
        domain: "unknown.com",
        blockNavigate: { enabled: false, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      });
    });
  });

  describe("navigation blocking callback", () => {
    it("blocks navigation for domain with blocking enabled", async () => {
      const { commands, platform } = setup();

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        blockNavigate: { enabled: true, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      });

      const callback = platform.onNavigationBlock.mock.calls[0]?.[0];
      expect(callback).toBeDefined();

      // Block navigation from example.com
      expect(
        callback("tab-1" as TabId, "https://other.com", "https://example.com/page", "navigate"),
      ).toBe(true);
    });

    it("allows navigation for domain without blocking", async () => {
      const { platform } = setup();

      const callback = platform.onNavigationBlock.mock.calls[0]?.[0];
      expect(callback).toBeDefined();

      // No blocking rules for other.com
      expect(
        callback("tab-1" as TabId, "https://elsewhere.com", "https://other.com/page", "navigate"),
      ).toBe(false);
    });

    it("respects cross-origin-only setting", async () => {
      const { commands, platform } = setup();

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        blockNavigate: { enabled: true, crossOriginOnly: true },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      });

      const callback = platform.onNavigationBlock.mock.calls[0]?.[0];

      // Same origin — should allow
      expect(
        callback(
          "tab-1" as TabId,
          "https://example.com/other",
          "https://example.com/page",
          "navigate",
        ),
      ).toBe(false);

      // Cross origin — should block
      expect(
        callback("tab-1" as TabId, "https://other.com", "https://example.com/page", "navigate"),
      ).toBe(true);
    });

    it("blocks new tabs and windows", async () => {
      const { commands, platform } = setup();

      await commands.send(DOMAIN_NAVIGATION_SET, {
        domain: "example.com",
        blockNavigate: { enabled: false, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: true,
        blockNewWindows: true,
      });

      const callback = platform.onNavigationBlock.mock.calls[0]?.[0];

      expect(
        callback("tab-1" as TabId, "https://other.com", "https://example.com/page", "new-tab"),
      ).toBe(true);

      expect(
        callback("tab-1" as TabId, "https://other.com", "https://example.com/page", "new-window"),
      ).toBe(true);
    });
  });
});

import fs from "node:fs";
import path from "node:path";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import { SingletonTabMap } from "../../shared/singleton-tab";
import type { TabId } from "../../shared/types";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { TABS_CLOSED, TABS_UPDATED } from "../tabs/tabs.shared";
import {
  DOMAIN_CSS_CHANGED,
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_OPEN,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
  type DomainCssCommands,
  type DomainCssEvents,
} from "./domain-css.shared";

type AllCommands = DomainCssCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = DomainCssEvents & Pick<TabsEvents, typeof TABS_CLOSED | typeof TABS_UPDATED>;

export interface DomainCssDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  dataDir: string;
  getTabsSnapshot: () => Map<TabId, Tab>;
}

interface DomainState {
  enabled: boolean;
}

// Track CSS keys injected per tab for removal
const injectedCssKeys = new Map<TabId, string>();

// Per-domain state (enabled/disabled)
let domainStates = new Map<string, DomainState>();

// File watchers
const watchers = new Map<string, fs.FSWatcher>();

let cssDir: string;
let deps: DomainCssDeps;

function isValidDomain(domain: string): boolean {
  return domain.length > 0 && !/[/\\:]|\.\./.test(domain);
}

function getCssFilePath(domain: string): string {
  if (!isValidDomain(domain)) throw new Error(`Invalid domain: ${domain}`);
  return path.join(cssDir, `${domain}.css`);
}

function cssFileExists(domain: string): boolean {
  return fs.existsSync(getCssFilePath(domain));
}

function readCssFile(domain: string): string | null {
  const filePath = getCssFilePath(domain);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

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

function emitChanged(domain: string): void {
  const state = domainStates.get(domain);
  deps.events.emit(DOMAIN_CSS_CHANGED, {
    domain,
    enabled: state?.enabled ?? false,
    hasFile: cssFileExists(domain),
  });
}

async function injectCssForTab(tabId: TabId, domain: string): Promise<void> {
  const state = domainStates.get(domain);
  if (!state?.enabled) return;

  const css = readCssFile(domain);

  // Remove any previously injected CSS first
  await removeCssFromTab(tabId);
  if (!css) return;

  try {
    const key = await deps.platform.insertCSS(tabId, css);
    injectedCssKeys.set(tabId, key);
  } catch {
    // Tab may have been closed
  }
}

async function removeCssFromTab(tabId: TabId): Promise<void> {
  const key = injectedCssKeys.get(tabId);
  if (!key) return;

  try {
    await deps.platform.removeInsertedCSS(tabId, key);
  } catch {
    // Tab may have been closed
  }
  injectedCssKeys.delete(tabId);
}

async function injectOrRemoveForAllTabs(domain: string): Promise<void> {
  const tabs = deps.getTabsSnapshot();
  for (const [tabId, tab] of tabs) {
    if (tab.builtIn) continue;
    const tabDomain = getDomainFromUrl(tab.url);
    if (tabDomain === domain) {
      const state = domainStates.get(domain);
      if (state?.enabled) {
        await injectCssForTab(tabId, domain);
      } else {
        await removeCssFromTab(tabId);
      }
    }
  }
}

function startWatching(domain: string): void {
  if (watchers.has(domain)) return;

  const filePath = getCssFilePath(domain);
  if (!fs.existsSync(filePath)) return;

  try {
    const watcher = fs.watch(filePath, (eventType) => {
      const handleChange = async () => {
        if (eventType === "rename") {
          // File was deleted
          if (!fs.existsSync(filePath)) {
            stopWatching(domain);
            const state = domainStates.get(domain);
            if (state?.enabled) {
              state.enabled = false;
              await persistStates();
              await injectOrRemoveForAllTabs(domain);
              emitChanged(domain);
            }
            return;
          }
        }
        // File was changed — re-inject
        await injectOrRemoveForAllTabs(domain);
      };
      handleChange().catch(logError("domain-css", `watch ${domain}`));
    });

    watchers.set(domain, watcher);
  } catch {
    // File may not exist yet
  }
}

function stopWatching(domain: string): void {
  const watcher = watchers.get(domain);
  if (watcher) {
    watcher.close();
    watchers.delete(domain);
  }
}

async function persistStates(): Promise<void> {
  const serializable: Record<string, DomainState> = {};
  for (const [domain, state] of domainStates) {
    serializable[domain] = state;
  }
  try {
    await deps.dataStore.setSetting("domain-css-states", serializable);
  } catch (error) {
    console.error("Failed to persist domain CSS states", error);
  }
}

export default defineFeature<DomainCssDeps>({
  register(d_) {
    deps = d_;
    cssDir = path.join(d_.dataDir, "domain-css");
    domainStates = new Map();
    injectedCssKeys.clear();
    for (const w of watchers.values()) w.close();
    watchers.clear();

    const { commands, events } = d_;

    const domainTabs = new SingletonTabMap({
      activate: (tabId) => commands.send("tabs:activate", { tabId }),
      create: (url) => commands.send("tabs:create", { url }),
    });

    // Clean up singleton + CSS tracking when tab closes
    events.on(TABS_CLOSED, (payload) => {
      const { tabId } = payload;
      domainTabs.onClose(tabId);
      injectedCssKeys.delete(tabId);
    });

    // When a tab navigates, inject/remove CSS for the new domain
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      if (tab.builtIn) return;

      const domain = getDomainFromUrl(tab.url);
      if (!domain) {
        removeCssFromTab(tab.id).catch(logError("domain-css", "remove css"));
        return;
      }

      const state = domainStates.get(domain);
      if (state?.enabled) {
        injectCssForTab(tab.id, domain).catch(logError("domain-css", "inject css"));
      } else {
        removeCssFromTab(tab.id).catch(logError("domain-css", "remove css"));
      }
    });

    // ── Commands ──────────────────────────────────────────────────

    commands.handle(DOMAIN_CSS_OPEN, async (payload) => {
      const { domain } = payload;
      return domainTabs.openOrActivate(
        domain,
        `app:domain-css?domain=${encodeURIComponent(domain)}`,
      );
    });

    commands.handle(DOMAIN_CSS_GET_STATE, async (payload) => {
      const { domain } = payload;
      const state = domainStates.get(domain);
      return {
        domain,
        enabled: state?.enabled ?? false,
        hasFile: cssFileExists(domain),
      };
    });

    commands.handle(DOMAIN_CSS_TOGGLE, async (payload) => {
      const { domain } = payload;
      if (!isValidDomain(domain)) throw new Error(`Invalid domain: ${domain}`);
      const state = domainStates.get(domain) ?? { enabled: false };
      state.enabled = !state.enabled;
      domainStates.set(domain, state);

      await persistStates();
      await injectOrRemoveForAllTabs(domain);

      if (state.enabled && cssFileExists(domain)) {
        startWatching(domain);
      } else {
        stopWatching(domain);
      }

      emitChanged(domain);
    });

    commands.handle(DOMAIN_CSS_EDIT, async (payload) => {
      const { domain } = payload;
      const filePath = getCssFilePath(domain);

      // Ensure CSS directory exists
      fs.mkdirSync(cssDir, { recursive: true });

      // Create empty file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `/* Custom CSS for ${domain} */\n`);
      }

      // Auto-enable CSS
      const state = domainStates.get(domain) ?? { enabled: false };
      if (!state.enabled) {
        state.enabled = true;
        domainStates.set(domain, state);
        await persistStates();
        await injectOrRemoveForAllTabs(domain);
      }

      startWatching(domain);
      emitChanged(domain);

      // Open in system editor
      await deps.platform.openPath(filePath);
    });

    commands.handle(DOMAIN_CSS_REMOVE, async (payload) => {
      const { domain } = payload;
      const filePath = getCssFilePath(domain);

      stopWatching(domain);

      // Remove injected CSS from all tabs
      const state = domainStates.get(domain);
      if (state) {
        state.enabled = false;
        await persistStates();
      }
      await injectOrRemoveForAllTabs(domain);

      // Delete file
      try {
        fs.unlinkSync(filePath);
      } catch {
        // File may not exist
      }

      domainStates.delete(domain);
      await persistStates();
      emitChanged(domain);
    });
  },

  async start({ dataStore }) {
    fs.mkdirSync(cssDir, { recursive: true });

    const stored = await dataStore.getSetting<Record<string, DomainState>>("domain-css-states");
    if (stored) {
      for (const [domain, state] of Object.entries(stored)) {
        if (!isValidDomain(domain)) {
          console.error("Skipping invalid persisted domain CSS state", domain);
          continue;
        }
        domainStates.set(domain, state);
        if (state.enabled && cssFileExists(domain)) {
          startWatching(domain);
        }
      }
    }
  },
});

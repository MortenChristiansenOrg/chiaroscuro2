import { randomUUID } from "node:crypto";
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
import type { SubTabsEvents } from "../sub-tabs/sub-tabs.shared";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { TABS_CLOSED, TABS_UPDATED } from "../tabs/tabs.shared";
import {
  DEFAULT_DOMAIN_NAVIGATION_STATE,
  DEFAULT_NAVIGATION_BLOCK_RULE,
  DOMAIN_CSS_CHANGED,
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
  DOMAIN_NAVIGATION_CHANGED,
  DOMAIN_NAVIGATION_GET_STATE,
  DOMAIN_NAVIGATION_SET,
  DOMAIN_SETTINGS_OPEN,
  type DomainCssCommands,
  type DomainCssEvents,
  type DomainNavigationState,
  type NavigationBlockRule,
} from "./domain-css.shared";

type AllCommands = DomainCssCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = DomainCssEvents &
  Pick<TabsEvents, typeof TABS_CLOSED | typeof TABS_UPDATED> &
  Pick<SubTabsEvents, "sub-tabs:opened" | "sub-tabs:updated" | "sub-tabs:closed">;

export interface DomainCssDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  dataDir: string;
  getTabsSnapshot: () => Map<TabId, Pick<Tab, "url" | "builtIn">>;
}

interface DomainState {
  enabled: boolean;
}

interface PersistedNavigationState {
  blockNavigate?: NavigationBlockRule;
  blockRedirect?: NavigationBlockRule;
  blockFrameNavigate?: NavigationBlockRule;
  blockNewTabs?: boolean;
  blockNewWindows?: boolean;
}

// Track CSS keys injected per tab for removal
const previewTabs = new Set<TabId>();
const injectedCssKeys = new Map<TabId, string>();
const cssOperations = new Map<TabId, Promise<void>>();

// Serialize native insert/remove calls so a late navigation or file-watcher
// injection cannot leave duplicate styles underneath an AI preview.
function queueCss<T>(tabId: TabId, operation: () => Promise<T>): Promise<T> {
  const result = (cssOperations.get(tabId) ?? Promise.resolve()).then(operation);
  const settled = result.then(
    () => {},
    () => {},
  );
  cssOperations.set(tabId, settled);
  void settled.then(() => {
    if (cssOperations.get(tabId) === settled) cssOperations.delete(tabId);
  });
  return result;
}

// Per-domain state (enabled/disabled)
let domainStates = new Map<string, DomainState>();

// Per-domain navigation blocking rules
let navigationStates = new Map<string, Omit<DomainNavigationState, "domain">>();

// File watchers
const watchers = new Map<string, fs.FSWatcher>();

let cssDir: string;
let deps: DomainCssDeps;
// Sync must not read before saved state loads, or every domain would look removed.
let loaded = false;
let stopNavigationBlock: (() => void) | undefined;

function shouldBlock(rule: NavigationBlockRule, targetUrl: string, currentUrl: string): boolean {
  if (!rule.enabled) return false;
  if (!rule.crossOriginOnly) return true;
  try {
    return new URL(targetUrl).host !== new URL(currentUrl).host;
  } catch {
    return false;
  }
}

function isNavigationDefault(state: Omit<DomainNavigationState, "domain">): boolean {
  return (
    !state.blockNavigate.enabled &&
    !state.blockRedirect.enabled &&
    !state.blockFrameNavigate.enabled &&
    !state.blockNewTabs &&
    !state.blockNewWindows
  );
}

async function persistNavigationStates(): Promise<void> {
  const serializable: Record<string, PersistedNavigationState> = {};
  for (const [domain, state] of navigationStates) {
    serializable[domain] = state;
  }
  try {
    await deps.dataStore.setSetting("domain-navigation-states", serializable);
  } catch (error) {
    console.error("Failed to persist domain navigation states", error);
  }
}

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

function injectCssForTab(tabId: TabId, domain: string): Promise<void> {
  return queueCss(tabId, () => injectCssNow(tabId, domain));
}
async function injectCssNow(tabId: TabId, domain: string): Promise<void> {
  if (previewTabs.has(tabId)) return;
  const state = domainStates.get(domain);
  if (!state?.enabled) return;

  const css = readCssFile(domain);

  // Remove any previously injected CSS first
  await removeCssNow(tabId);
  if (!css) return;

  try {
    const key = await deps.platform.insertCSS(tabId, css);
    injectedCssKeys.set(tabId, key);
  } catch {
    // Tab may have been closed
  }
}

function removeCssFromTab(tabId: TabId): Promise<void> {
  return queueCss(tabId, () => removeCssNow(tabId));
}
async function removeCssNow(tabId: TabId): Promise<void> {
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
              domainStates.set(domain, { ...state, enabled: false });
              await persistStates();
              await injectOrRemoveForAllTabs(domain);
              emitChanged(domain);
            }
            return;
          }
        }
        // File was changed — re-inject
        await injectOrRemoveForAllTabs(domain);
        emitChanged(domain);
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
    loaded = false;
    cssDir = path.join(d_.dataDir, "domain-css");
    domainStates = new Map();
    navigationStates = new Map();
    injectedCssKeys.clear();
    previewTabs.clear();
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

    // Parent tabs and sub-tabs use the same per-domain stylesheet.
    const updateCss = (tabId: TabId, tab: Pick<Tab, "url" | "builtIn">) => {
      if (tab.builtIn) return;
      const domain = getDomainFromUrl(tab.url);
      if (domain && domainStates.get(domain)?.enabled)
        injectCssForTab(tabId, domain).catch(logError("domain-css", "inject css"));
      else removeCssFromTab(tabId).catch(logError("domain-css", "remove css"));
    };
    events.on(TABS_UPDATED, ({ tab }) => updateCss(tab.id, tab));
    events.on("sub-tabs:opened", ({ subTab }) => updateCss(subTab.id, subTab));
    events.on("sub-tabs:updated", ({ subTab }) => updateCss(subTab.id, subTab));
    events.on("sub-tabs:closed", ({ subTabId }) => injectedCssKeys.delete(subTabId));

    // ── Navigation blocking callback ────────────────────────────
    stopNavigationBlock = d_.platform.onNavigationBlock((tabId, targetUrl, currentUrl, type) => {
      const domain = getDomainFromUrl(currentUrl);
      if (!domain) return false;
      const navState = navigationStates.get(domain);
      if (!navState) return false;

      switch (type) {
        case "navigate":
          return shouldBlock(navState.blockNavigate, targetUrl, currentUrl);
        case "redirect":
          return shouldBlock(navState.blockRedirect, targetUrl, currentUrl);
        case "frame-navigate":
          return shouldBlock(navState.blockFrameNavigate, targetUrl, currentUrl);
        case "new-tab":
          return navState.blockNewTabs;
        case "new-window":
          return navState.blockNewWindows;
      }
    });

    // ── Commands ──────────────────────────────────────────────────

    commands.handle(DOMAIN_SETTINGS_OPEN, async (payload) => {
      const { domain } = payload;
      return domainTabs.openOrActivate(
        domain,
        `/domain-settings?domain=${encodeURIComponent(domain)}`,
      );
    });

    commands.handle("domain-css:can-restore", async ({ domain }) =>
      fs.existsSync(`${getCssFilePath(domain)}.previous.json`),
    );
    commands.handle("domain-css:restore", async ({ domain }) => restoreGeneratedCss(domain));
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
      const prev = domainStates.get(domain);
      const state: DomainState = { enabled: !(prev?.enabled ?? false) };
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
      const state = domainStates.get(domain);
      if (!state?.enabled) {
        domainStates.set(domain, { ...(state ?? { enabled: false }), enabled: true });
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
        domainStates.set(domain, { ...state, enabled: false });
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

    commands.handle(DOMAIN_NAVIGATION_SET, async (payload) => {
      const { domain, ...navSettings } = payload;
      if (!isValidDomain(domain)) throw new Error(`Invalid domain: ${domain}`);

      if (isNavigationDefault(navSettings)) {
        navigationStates.delete(domain);
      } else {
        navigationStates.set(domain, navSettings);
      }

      await persistNavigationStates();
      events.emit(DOMAIN_NAVIGATION_CHANGED, { domain, ...navSettings });
    });

    commands.handle(DOMAIN_NAVIGATION_GET_STATE, async (payload) => {
      const { domain } = payload;
      const state = navigationStates.get(domain);
      return {
        domain,
        ...(state ?? { ...DEFAULT_DOMAIN_NAVIGATION_STATE }),
      };
    });
  },

  teardown() {
    loaded = false;
    if (stopNavigationBlock) {
      stopNavigationBlock();
      stopNavigationBlock = undefined;
    }
    for (const w of watchers.values()) w.close();
    watchers.clear();
    domainStates.clear();
    navigationStates.clear();
    injectedCssKeys.clear();
    previewTabs.clear();
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

    const storedNav = await dataStore.getSetting<Record<string, PersistedNavigationState>>(
      "domain-navigation-states",
    );
    if (storedNav) {
      for (const [domain, state] of Object.entries(storedNav)) {
        if (!isValidDomain(domain)) {
          console.error("Skipping invalid persisted domain navigation state", domain);
          continue;
        }
        navigationStates.set(domain, {
          blockNavigate: state.blockNavigate ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
          blockRedirect: state.blockRedirect ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
          blockFrameNavigate: state.blockFrameNavigate ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
          blockNewTabs: state.blockNewTabs ?? false,
          blockNewWindows: state.blockNewWindows ?? false,
        });
      }
    }
    loaded = true;
  },
});

/** A domain's styles and navigation rules, as sync stores them. */
export interface DomainCustomization {
  css: string | null;
  enabled: boolean;
  navigation: Omit<DomainNavigationState, "domain">;
}

function lstatOrNull(file: string): fs.Stats | null {
  try {
    return fs.lstatSync(file);
  } catch {
    return null;
  }
}

/** Settings for both maps, saved together so they can't disagree. */
function serializedStates(): Record<string, unknown> {
  return {
    "domain-css-states": Object.fromEntries(domainStates),
    "domain-navigation-states": Object.fromEntries(navigationStates),
  };
}

/** Like `readCssFile`, but only a missing file reads as no stylesheet. */
function readCssFileStrict(domain: string): string | null {
  try {
    return fs.readFileSync(getCssFilePath(domain), "utf-8");
  } catch (error) {
    // A dangling link also reads as ENOENT, but the stylesheet isn't gone.
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !lstatOrNull(getCssFilePath(domain)))
      return null;
    throw new Error(`The stylesheet for ${domain} couldn't be read.`);
  }
}

function readCustomization(domain: string): DomainCustomization | null {
  const css = readCssFileStrict(domain);
  const enabled = domainStates.get(domain)?.enabled ?? false;
  const navigation = navigationStates.get(domain) ?? DEFAULT_DOMAIN_NAVIGATION_STATE;
  if (css === null && !enabled && isNavigationDefault(navigation)) return null;
  return { css, enabled, navigation: structuredClone(navigation) };
}

/** Every domain with a stylesheet, enabled CSS or navigation rules. */
export function listDomainCustomizations(): Map<string, DomainCustomization> {
  if (!loaded) throw new Error("Domain settings haven't loaded yet.");
  const domains = new Set([...domainStates.keys(), ...navigationStates.keys()]);
  for (const file of fs.readdirSync(cssDir)) {
    const domain = file.endsWith(".css") ? file.slice(0, -4) : "";
    if (isValidDomain(domain)) domains.add(domain);
  }
  const result = new Map<string, DomainCustomization>();
  for (const domain of domains) {
    const customization = readCustomization(domain);
    if (customization) result.set(domain, customization);
  }
  return result;
}

export function getDomainCustomization(domain: string): DomainCustomization | null {
  if (!loaded) throw new Error("Domain settings haven't loaded yet.");
  return readCustomization(domain);
}

/**
 * Replace a domain's customization with another machine's version (`null` removes it) and
 * save it durably, or throw with nothing changed. Local state changes before the first
 * await, so a caller that checked the current version with `getDomainCustomization` just
 * before calling can't overwrite a change made meanwhile.
 */
/** The stylesheet was edited on this machine while a synced version was being applied. */
export class DomainCssChangedError extends Error {
  constructor(domain: string) {
    super(`The stylesheet for ${domain} changed on this machine.`);
    this.name = "DomainCssChangedError";
  }
}

/**
 * Apply another machine's version. The settings are saved before the stylesheet is swapped
 * in; if the browser stops between the two, the next sync sees the half-applied state as a
 * local edit and merges it with the same version per property, so nothing is lost.
 */
export async function applyDomainCustomization(
  domain: string,
  value: DomainCustomization | null,
): Promise<void> {
  if (!loaded) throw new Error("Domain settings haven't loaded yet.");
  const file = getCssFilePath(domain);
  const previous = {
    css: readCssFileStrict(domain),
    state: domainStates.get(domain),
    navigation: navigationStates.get(domain),
  };
  const css = value?.css ?? null;
  const cssChanged = css !== previous.css;
  // Stage the new stylesheet first: if that fails, nothing has changed yet.
  let staged: string | undefined;
  if (cssChanged && css !== null) {
    fs.mkdirSync(cssDir, { recursive: true });
    staged = path.join(cssDir, `.sync-${randomUUID().slice(0, 8)}.tmp`);
    fs.writeFileSync(staged, css);
  }
  if (value) domainStates.set(domain, { enabled: value.enabled });
  else domainStates.delete(domain);
  if (value && !isNavigationDefault(value.navigation))
    navigationStates.set(domain, structuredClone(value.navigation));
  else navigationStates.delete(domain);
  try {
    await deps.dataStore.setSettings(serializedStates(), { durable: true });
    // An edit made while the settings were saving wins over the synced version.
    if (readCssFileStrict(domain) !== previous.css) throw new DomainCssChangedError(domain);
    stopWatching(domain);
    if (staged) fs.renameSync(staged, file);
    else if (cssChanged) fs.rmSync(file, { force: true });
  } catch (error) {
    // Put the settings back, so this machine doesn't remember a version it didn't save.
    if (staged)
      try {
        fs.rmSync(staged, { force: true });
      } catch (cleanupError) {
        logError("domain-css", `remove staged stylesheet for ${domain}`)(cleanupError);
      }
    if (previous.state) domainStates.set(domain, previous.state);
    else domainStates.delete(domain);
    if (previous.navigation) navigationStates.set(domain, previous.navigation);
    else navigationStates.delete(domain);
    await deps.dataStore.setSettings(serializedStates());
    if (previous.state?.enabled && previous.css !== null) startWatching(domain);
    if (error instanceof DomainCssChangedError) throw error;
    throw new Error(`The change for ${domain} couldn't be saved on this machine.`, {
      cause: error,
    });
  }
  // The AI undo snapshot restores the stylesheet and enabled state from before generation;
  // once another machine changes either, restoring would bring back an outdated version.
  // The update is already saved, so a failure here mustn't skip refreshing the tabs.
  if (cssChanged || (previous.state?.enabled ?? false) !== (value?.enabled ?? false))
    try {
      fs.rmSync(`${file}.previous.json`, { force: true });
    } catch (error) {
      logError("domain-css", `drop restore snapshot for ${domain}`)(error);
    }
  await injectOrRemoveForAllTabs(domain);
  if (value?.enabled && css !== null) startWatching(domain);
  emitChanged(domain);
  deps.events.emit(DOMAIN_NAVIGATION_CHANGED, {
    domain,
    ...structuredClone(navigationStates.get(domain) ?? DEFAULT_DOMAIN_NAVIGATION_STATE),
  });
}

export interface CssSnapshot {
  source: string | null;
  enabled: boolean;
}
export function getDomainCssSnapshot(domain: string): CssSnapshot {
  return { source: readCssFile(domain), enabled: domainStates.get(domain)?.enabled ?? false };
}
export async function previewDomainCss(
  tabId: TabId,
  domain: string,
  source: string,
): Promise<() => Promise<void>> {
  return queueCss(tabId, async () => {
    previewTabs.add(tabId);
    await removeCssNow(tabId);
    let key: string;
    try {
      key = await deps.platform.insertCSS(tabId, source);
    } catch (error) {
      previewTabs.delete(tabId);
      await injectCssNow(tabId, domain);
      throw error;
    }
    let restored = false;
    return () =>
      queueCss(tabId, async () => {
        if (restored) return;
        restored = true;
        await deps.platform.removeInsertedCSS(tabId, key).catch(() => {});
        previewTabs.delete(tabId);
        const tab = deps.getTabsSnapshot().get(tabId);
        const currentDomain = tab && getDomainFromUrl(tab.url);
        if (currentDomain) await injectCssNow(tabId, currentDomain);
      });
  });
}

export async function saveGeneratedCss(
  domain: string,
  source: string,
  before: CssSnapshot,
): Promise<void> {
  const current = getDomainCssSnapshot(domain);
  if (current.source !== before.source || current.enabled !== before.enabled)
    throw new Error("CSS changed while AI was working. Your changes were kept; try again.");
  const file = getCssFilePath(domain);
  // Durable undo preserves both absence of a file and the previous enable state.
  fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(`${file}.previous.json`, JSON.stringify(before), { mode: 0o600 });
  stopWatching(domain);
  fs.writeFileSync(file, source);
  domainStates.set(domain, { enabled: true });
  await persistStates();
  await injectOrRemoveForAllTabs(domain);
  startWatching(domain);
  emitChanged(domain);
}
async function restoreGeneratedCss(domain: string): Promise<void> {
  const file = getCssFilePath(domain);
  const before = JSON.parse(fs.readFileSync(`${file}.previous.json`, "utf8")) as CssSnapshot;
  stopWatching(domain);
  if (before.source === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, before.source);
  domainStates.set(domain, { enabled: before.enabled });
  await persistStates();
  await injectOrRemoveForAllTabs(domain);
  if (before.enabled && before.source !== null) startWatching(domain);
  fs.rmSync(`${file}.previous.json`, { force: true });
  emitChanged(domain);
}

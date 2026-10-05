import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import type { TabId } from "../../shared/types";
import type { SubTabsEvents } from "../sub-tabs/sub-tabs.shared";
import type { TabsEvents } from "../tabs/tabs.shared";
import { DomainScriptSchema } from "./domain-scripts.contracts";
import {
  DOMAIN_SCRIPTS_ACTIONS,
  DOMAIN_SCRIPTS_CHANGED,
  DOMAIN_SCRIPTS_EXECUTED,
  DOMAIN_SCRIPTS_LIST,
  DOMAIN_SCRIPTS_REMOVE,
  DOMAIN_SCRIPTS_RUN,
  DOMAIN_SCRIPTS_RUN_ALIAS,
  DOMAIN_SCRIPTS_SAVE,
  type DomainScript,
  type DomainScriptsCommands,
  type DomainScriptsEvents,
} from "./domain-scripts.shared";
import { matchesScript, normalizeDomain, normalizeScript } from "./matching";

type AllEvents = DomainScriptsEvents &
  Pick<TabsEvents, "tabs:created" | "tabs:updated" | "tabs:closed" | "tabs:list-changed"> &
  Pick<SubTabsEvents, "sub-tabs:opened" | "sub-tabs:updated" | "sub-tabs:closed">;
export interface PageSnapshot {
  url: string;
  builtIn?: boolean;
  loading?: boolean;
}
export interface DomainScriptsDeps {
  commands: CommandBus<DomainScriptsCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActivePageTabId: () => TabId | undefined;
  getPageSnapshots: () => Map<TabId, PageSnapshot>;
}

export const DOMAIN_SCRIPTS_SETTING = "domain-scripts";
interface PageState {
  loading: boolean;
  ran: boolean;
  generation: number;
  unlisten: (() => void)[];
}
let cleanup: (() => void) | undefined;
let begin: (() => Promise<void>) | undefined;

export default defineFeature<DomainScriptsDeps>({
  register(deps) {
    cleanup?.();
    const { commands, events, platform, dataStore } = deps;
    let scripts: DomainScript[] = [];
    let started = false;
    let disposed = false;
    let mutations: Promise<unknown> = Promise.resolve();
    const pages = new Map<TabId, PageState>();
    const shortcuts = new Map<string, () => void>();
    const subscriptions: (() => void)[] = [];

    function mutate<T>(operation: () => Promise<T>): Promise<T> {
      const pending = mutations.then(operation);
      mutations = pending.catch(() => {});
      return pending;
    }

    function domainScripts(domain: string) {
      return scripts.filter((script) => script.domain === domain).map((script) => ({ ...script }));
    }

    function publish(domain: string) {
      events.emit(DOMAIN_SCRIPTS_CHANGED, { domain, scripts: domainScripts(domain) });
    }

    function currentUrl(tabId: TabId): string {
      if (deps.getPageSnapshots().get(tabId)?.builtIn)
        throw new Error("Website scripts cannot run on browser pages.");
      const url = platform.getTabUrl(tabId);
      if (!url) throw new Error("The selected page is no longer available.");
      return url;
    }

    async function execute(id: string, tabId: TabId, automatic = false) {
      const script = scripts.find((script) => script.id === id);
      if (!script) throw new Error("The website script no longer exists.");
      try {
        if (!script.enabled) throw new Error("The website script is disabled.");
        if (!automatic && script.runAt !== "manual")
          throw new Error("This script runs automatically on page load.");
        const expectedUrl = currentUrl(tabId);
        if (!matchesScript(script, expectedUrl))
          throw new Error("The selected page does not match this script's domain and URL path.");
        const result = await platform.executeWebsiteScript(tabId, {
          source: script.source,
          expectedUrl,
          userGesture: !automatic,
        });
        if (disposed || scripts.find((current) => current.id === id) !== script)
          throw new Error("The website script changed while it was running.");
        if (currentUrl(tabId) !== expectedUrl)
          throw new Error("The page navigated while the script was running.");
        if (result.clipboard !== undefined) await platform.writeClipboard(result.clipboard);
        events.emit(DOMAIN_SCRIPTS_EXECUTED, {
          id,
          domain: script.domain,
          tabId,
          status: "succeeded",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        events.emit(DOMAIN_SCRIPTS_EXECUTED, {
          id,
          domain: script.domain,
          tabId,
          status: "failed",
          error: message,
        });
        throw error;
      }
    }

    function bind(script: DomainScript): (() => void) | undefined {
      if (!script.enabled || script.runAt !== "manual" || !script.shortcut) return;
      return platform.registerWebsiteShortcut(script.shortcut, () => {
        const tabId = deps.getActivePageTabId();
        if (!tabId) return false;
        let url: string;
        try {
          url = currentUrl(tabId);
        } catch {
          return false;
        }
        if (!matchesScript(script, url)) return false;
        execute(script.id, tabId).catch(logError("domain-scripts", "shortcut execution"));
        return true;
      });
    }

    function validateUnique(script: DomainScript) {
      if (!script.enabled || script.runAt !== "manual" || !script.alias) return;
      if (
        scripts.some(
          (other) =>
            other.id !== script.id &&
            other.enabled &&
            other.runAt === "manual" &&
            other.domain === script.domain &&
            other.alias === script.alias,
        )
      )
        throw new Error(`Alias ${script.alias} is already used on this domain.`);
    }

    async function automatic(tabId: TabId) {
      const page = pages.get(tabId);
      if (!started || !page || page.ran || disposed) return;
      // Metadata can report completion before Chromium's main frame is ready.
      // Keep the document eligible until the native completion event arrives.
      if (platform.isTabLoading(tabId)) return;
      let url: string;
      try {
        url = currentUrl(tabId);
      } catch {
        return;
      }
      page.ran = true;
      const generation = page.generation;
      const candidates = scripts.filter(
        (script) => script.enabled && script.runAt === "page-load" && matchesScript(script, url),
      );
      for (const script of candidates) {
        if (
          disposed ||
          pages.get(tabId) !== page ||
          page.generation !== generation ||
          platform.getTabUrl(tabId) !== url
        )
          return;
        if (!scripts.includes(script) || !script.enabled) continue;
        // Failure is reported as an event; other matching scripts still run.
        await execute(script.id, tabId, true).catch(() => {});
      }
    }

    function attach(tabId: TabId, snapshot: PageSnapshot) {
      if (snapshot.builtIn || pages.has(tabId)) return;
      const page: PageState = {
        loading: snapshot.loading ?? true,
        ran: false,
        generation: 0,
        unlisten: [],
      };
      pages.set(tabId, page);
      page.unlisten.push(
        platform.onTabEvent(tabId, "did-start-navigation", (event, _url, inPlace, mainFrame) => {
          const details =
            typeof event === "object" && event !== null
              ? (event as { isMainFrame?: boolean; isSameDocument?: boolean })
              : undefined;
          if (!(details?.isMainFrame ?? mainFrame) || (details?.isSameDocument ?? inPlace)) return;
          page.generation++;
          page.ran = false;
          page.loading = true;
        }),
      );
      page.unlisten.push(
        platform.onTabEvent(tabId, "did-finish-load", () => {
          page.loading = false;
          automatic(tabId).catch(logError("domain-scripts", "automatic execution"));
        }),
      );
      if (snapshot.loading === false)
        automatic(tabId).catch(logError("domain-scripts", "loaded page execution"));
    }

    function update(tabId: TabId, snapshot: PageSnapshot) {
      const existing = pages.get(tabId);
      attach(tabId, snapshot);
      if (!existing) return;
      if (snapshot.loading === true && !existing.loading && platform.isTabLoading(tabId)) {
        existing.generation++;
        existing.ran = false;
      }
      if (snapshot.loading !== undefined) existing.loading = snapshot.loading;
      if (snapshot.loading === false)
        automatic(tabId).catch(logError("domain-scripts", "completed page execution"));
    }

    function detach(tabId: TabId) {
      const page = pages.get(tabId);
      for (const off of page?.unlisten ?? []) off();
      pages.delete(tabId);
    }

    subscriptions.push(events.on("tabs:created", ({ tab }) => attach(tab.id, tab)));
    subscriptions.push(events.on("tabs:updated", ({ tab }) => update(tab.id, tab)));
    subscriptions.push(
      events.on("tabs:list-changed", ({ tabs }) => {
        for (const tab of tabs) attach(tab.id, tab);
      }),
    );
    subscriptions.push(events.on("tabs:closed", ({ tabId }) => detach(tabId)));
    subscriptions.push(events.on("sub-tabs:opened", ({ subTab }) => attach(subTab.id, subTab)));
    subscriptions.push(events.on("sub-tabs:updated", ({ subTab }) => update(subTab.id, subTab)));
    subscriptions.push(events.on("sub-tabs:closed", ({ subTabId }) => detach(subTabId)));

    commands.handle(DOMAIN_SCRIPTS_LIST, async ({ domain }) =>
      domain ? domainScripts(normalizeDomain(domain)) : scripts.map((script) => ({ ...script })),
    );
    commands.handle(DOMAIN_SCRIPTS_SAVE, ({ script: input }) =>
      mutate(async () => {
        const script = normalizeScript(DomainScriptSchema.parse(input));
        const previous = scripts.find((current) => current.id === script.id);
        if (previous && previous.domain !== script.domain)
          throw new Error(
            "A script's domain cannot be changed. Create a new script for that domain.",
          );
        validateUnique(script);
        shortcuts.get(script.id)?.();
        shortcuts.delete(script.id);
        let unbind: (() => void) | undefined;
        try {
          unbind = bind(script);
          const next = scripts.filter((current) => current.id !== script.id);
          next.push(script);
          await dataStore.setSetting(DOMAIN_SCRIPTS_SETTING, next);
          scripts = next;
          if (unbind) shortcuts.set(script.id, unbind);
          publish(script.domain);
          return { ...script };
        } catch (error) {
          unbind?.();
          if (previous) {
            const restore = bind(previous);
            if (restore) shortcuts.set(previous.id, restore);
          }
          throw error;
        }
      }),
    );
    commands.handle(DOMAIN_SCRIPTS_REMOVE, ({ id }) =>
      mutate(async () => {
        const previous = scripts.find((script) => script.id === id);
        if (!previous) return;
        const next = scripts.filter((script) => script.id !== id);
        await dataStore.setSetting(DOMAIN_SCRIPTS_SETTING, next);
        scripts = next;
        shortcuts.get(id)?.();
        shortcuts.delete(id);
        publish(previous.domain);
      }),
    );
    commands.handle(DOMAIN_SCRIPTS_RUN, async ({ id, tabId }) => {
      const target = tabId ?? deps.getActivePageTabId();
      if (!target) throw new Error("Select a matching website page to run this script.");
      await execute(id, target);
    });
    function actions() {
      const tabId = deps.getActivePageTabId();
      if (!tabId) return [];
      let url: string;
      try {
        url = currentUrl(tabId);
      } catch {
        return [];
      }
      return scripts.filter(
        (script) => script.enabled && script.runAt === "manual" && matchesScript(script, url),
      );
    }
    commands.handle(DOMAIN_SCRIPTS_ACTIONS, async ({ query }) => {
      const lower = query?.trim().toLowerCase() ?? "";
      return actions()
        .filter(
          (script) =>
            !lower || script.name.toLowerCase().includes(lower) || script.alias.includes(lower),
        )
        .map(({ id, name, alias, shortcut }) => ({ id, name, alias, shortcut }));
    });
    commands.handle(DOMAIN_SCRIPTS_RUN_ALIAS, async ({ alias }) => {
      const script = actions().find(
        (script) => script.alias && script.alias === alias.trim().toLowerCase(),
      );
      if (!script) return { handled: false };
      const tabId = deps.getActivePageTabId();
      if (!tabId) return { handled: false };
      await execute(script.id, tabId);
      return { handled: true };
    });

    begin = async () => {
      const persisted = await dataStore.getSetting<unknown>(DOMAIN_SCRIPTS_SETTING);
      const entries = Array.isArray(persisted) ? persisted : [];
      for (const entry of entries) {
        try {
          const script = normalizeScript(DomainScriptSchema.parse(entry));
          if (scripts.some((other) => other.id === script.id))
            throw new Error("Duplicate saved script id.");
          validateUnique(script);
          scripts.push(script);
          try {
            const off = bind(script);
            if (off) shortcuts.set(script.id, off);
          } catch (error) {
            // Keep the script editable and usable through the palette if its shortcut conflicts.
            logError("domain-scripts", `restore shortcut for ${script.name}`)(error);
          }
        } catch (error) {
          logError("domain-scripts", "restore saved script")(error);
        }
      }
      started = true;
      for (const domain of new Set(scripts.map((script) => script.domain))) publish(domain);
      for (const [tabId, snapshot] of deps.getPageSnapshots()) {
        attach(tabId, snapshot);
        if (snapshot.loading === false) await automatic(tabId);
      }
    };
    cleanup = () => {
      disposed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      for (const tabId of pages.keys()) detach(tabId);
      for (const off of shortcuts.values()) off();
      shortcuts.clear();
    };
  },
  async start() {
    await begin?.();
  },
  teardown() {
    cleanup?.();
    cleanup = undefined;
    begin = undefined;
  },
});

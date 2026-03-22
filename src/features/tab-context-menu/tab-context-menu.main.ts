import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import { TabScope } from "../../shared/tab-scope";
import type { TabId } from "../../shared/types";
import type { Bounds } from "../../shared/types";
import type { SearchProvider } from "../command-palette/resolve-input";
import { CONTEXT_MENU_SHOW, type ContextMenuCommands } from "../context-menu/context-menu.shared";
import { SETTINGS_GET, type Settings, type SettingsCommands } from "../settings/settings.shared";
import {
  TABS_CLOSED,
  TABS_CONTENT_BOUNDS_CHANGED,
  TABS_CREATE,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  type TabsCommands,
  type TabsEvents,
} from "../tabs/tabs.shared";
import {
  TAB_CONTEXT_MENU_COPY_IMAGE,
  TAB_CONTEXT_MENU_COPY_TEXT,
  TAB_CONTEXT_MENU_DOWNLOAD_IMAGE,
  TAB_CONTEXT_MENU_SEARCH_TEXT,
  type TabContextMenuCommands,
} from "./tab-context-menu.shared";

type AllCommands = TabContextMenuCommands & ContextMenuCommands & SettingsCommands & TabsCommands;
type AllEvents = TabsEvents;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
}

// Content script to detect page-handled context menus.
// Sets a flag that we check from the main process before showing our menu.
const CONTEXT_MENU_DETECT_SCRIPT = `
  (() => {
    if (window.__chiaroscuroCtxMenuPatched) return;
    window.__chiaroscuroCtxMenuPatched = true;
    window.__chiaroscuroCtxMenuPrevented = false;
    window.addEventListener('contextmenu', (e) => {
      queueMicrotask(() => {
        window.__chiaroscuroCtxMenuPrevented = e.defaultPrevented;
      });
    }, { capture: true });
  })();
`;

interface ContextMenuParams {
  x: number;
  y: number;
  linkURL: string;
  srcURL: string;
  mediaType: string;
  selectionText: string;
}

function getSearchUrl(provider: SearchProvider, query: string): string {
  return provider.urlTemplate.replace("{query}", encodeURIComponent(query));
}

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform } = deps;
    const tabScope = new TabScope();

    // Track tab content bounds for coordinate offset
    let contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
    events.on(TABS_CONTENT_BOUNDS_CHANGED, (bounds) => {
      contentBounds = bounds;
    });

    // ── Command handlers ───────────────────────────────────────────

    commands.handle(TAB_CONTEXT_MENU_COPY_TEXT, async ({ text }) => {
      platform.writeClipboard(text);
    });

    commands.handle(TAB_CONTEXT_MENU_COPY_IMAGE, async ({ tabId, x, y }) => {
      platform.copyImageAt(tabId, x, y);
    });

    commands.handle(TAB_CONTEXT_MENU_DOWNLOAD_IMAGE, async ({ url, tabId }) => {
      platform.downloadUrl(tabId, url);
    });

    commands.handle(TAB_CONTEXT_MENU_SEARCH_TEXT, async ({ text }) => {
      const settings: Settings = await commands.send(SETTINGS_GET, undefined);
      const providers = settings.searchProviders;
      const defaultBang = settings.defaultSearchProviderId;
      const provider = providers.find((p) => p.bang === defaultBang) ?? providers[0];
      if (!provider) return;
      const url = getSearchUrl(provider, text);
      await commands.send(TABS_CREATE, { url });
    });

    // ── Attach context-menu listener to each tab ───────────────────

    async function handleContextMenu(tabId: TabId, params: ContextMenuParams): Promise<void> {
      // Check if the page handled the contextmenu event
      try {
        const prevented = await platform.executeJavaScript(
          tabId,
          "window.__chiaroscuroCtxMenuPrevented === true",
        );
        if (prevented) return;
      } catch {
        // If script execution fails (e.g., page not loaded), proceed with our menu
      }

      const items: { label: string; icon: string; action: () => void }[] = [];

      // Selected text context
      const rawSelection = params.selectionText ?? "";
      const selection = rawSelection.trim();
      if (selection) {
        items.push({
          label: "Copy",
          icon: "copy",
          action: () => {
            commands
              .send(TAB_CONTEXT_MENU_COPY_TEXT, { text: rawSelection })
              .catch(logError("tab-context-menu", "copy text"));
          },
        });

        // Get search provider name for label
        let searchLabel = "Search";
        try {
          const settings: Settings = await commands.send(SETTINGS_GET, undefined);
          const providers = settings.searchProviders;
          const defaultBang = settings.defaultSearchProviderId;
          const provider = providers.find((p) => p.bang === defaultBang) ?? providers[0];
          if (provider) searchLabel = `Search with ${provider.name}`;
        } catch {
          // Fall back to generic label
        }

        items.push({
          label: searchLabel,
          icon: "magnifying-glass",
          action: () => {
            commands
              .send(TAB_CONTEXT_MENU_SEARCH_TEXT, { text: selection })
              .catch(logError("tab-context-menu", "search text"));
          },
        });
      }

      // Link context
      if (params.linkURL) {
        items.push({
          label: "Copy link",
          icon: "copy",
          action: () => {
            commands
              .send(TAB_CONTEXT_MENU_COPY_TEXT, { text: params.linkURL })
              .catch(logError("tab-context-menu", "copy link"));
          },
        });
      }

      // Image context
      if (params.mediaType === "image" && params.srcURL) {
        items.push({
          label: "Copy image",
          icon: "copy",
          action: () => {
            commands
              .send(TAB_CONTEXT_MENU_COPY_IMAGE, { tabId, x: params.x, y: params.y })
              .catch(logError("tab-context-menu", "copy image"));
          },
        });
        items.push({
          label: "Download image",
          icon: "download",
          action: () => {
            commands
              .send(TAB_CONTEXT_MENU_DOWNLOAD_IMAGE, { url: params.srcURL, tabId })
              .catch(logError("tab-context-menu", "download image"));
          },
        });
      }

      // Nothing actionable — don't show menu
      if (items.length === 0) return;

      // Show context menu via overlay
      // Offset by content bounds: params.x/y are relative to WebContentsView,
      // but the overlay expects window-content-area coordinates.
      const menuItems = items.map((it) => ({ label: it.label, icon: it.icon }));
      const selectedIndex = await commands.send(CONTEXT_MENU_SHOW, {
        items: menuItems,
        x: params.x + contentBounds.x,
        y: params.y + contentBounds.y,
      });

      if (selectedIndex >= 0 && selectedIndex < items.length) {
        items[selectedIndex]?.action();
      }
    }

    function attachContextMenuListener(tabId: TabId): void {
      // Inject detection script when page loads
      const cleanupLoad = platform.onTabEvent(tabId, "did-finish-load", () => {
        platform.executeJavaScript(tabId, CONTEXT_MENU_DETECT_SCRIPT).catch(() => {}); // Ignore errors on restricted pages
      });
      tabScope.add(tabId, cleanupLoad);

      // Also inject immediately in case page is already loaded
      platform.executeJavaScript(tabId, CONTEXT_MENU_DETECT_SCRIPT).catch(() => {});

      // Listen for context-menu events
      const cleanupCtx = platform.onTabEvent(
        tabId,
        "context-menu",
        (event: unknown, params: unknown) => {
          // Prevent Chrome's default context menu — we show our own overlay
          (event as { preventDefault?: () => void })?.preventDefault?.();
          const p = params as ContextMenuParams;
          handleContextMenu(tabId, p).catch(logError("tab-context-menu", "handle context menu"));
        },
      );
      tabScope.add(tabId, cleanupCtx);
    }

    // Attach to newly created tabs
    events.on(TABS_CREATED, ({ tab }) => {
      if (tab.builtIn) return;
      attachContextMenuListener(tab.id);
    });

    // Attach to restored tabs (start() emits TABS_LIST_CHANGED, not TABS_CREATED)
    events.on(TABS_LIST_CHANGED, ({ tabs }) => {
      for (const tab of tabs) {
        if (tab.builtIn) continue;
        if (tabScope.has(tab.id)) continue;
        attachContextMenuListener(tab.id);
      }
    });

    // Cleanup when tabs close
    events.on(TABS_CLOSED, ({ tabId }) => {
      tabScope.cleanup(tabId);
    });
  },
});

import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import { TABS_CLOSED, type TabsClosedEvent } from "../tabs/tabs.shared";
import {
  DEVTOOLS_TOGGLE,
  DEVTOOLS_TOGGLE_CHROME,
  type DevToolsCommands,
  type DevToolsEvents,
} from "./dev-tools.shared";

type AllEvents = DevToolsEvents & { [K in typeof TABS_CLOSED]: TabsClosedEvent };

interface Deps {
  commands: CommandBus<DevToolsCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  isDev: boolean;
  getActiveTabId: () => TabId | undefined;
  getActiveWindowId: () => WindowId | undefined;
}

export function register({
  commands,
  events,
  platform,
  isDev,
  getActiveTabId,
  getActiveWindowId,
}: Deps): void {
  // Track which tabs have devtools open (for cleanup)
  const openDevTools = new Set<TabId>();

  // ── Command handlers ───────────────────────────────────────────

  commands.handle(DEVTOOLS_TOGGLE, async () => {
    const tabId = getActiveTabId();
    if (!tabId) return;

    if (platform.isTabDevToolsOpened(tabId)) {
      platform.closeTabDevTools(tabId);
      openDevTools.delete(tabId);
    } else {
      platform.openTabDevTools(tabId, "right");
      openDevTools.add(tabId);
    }
  });

  commands.handle(DEVTOOLS_TOGGLE_CHROME, async () => {
    if (!isDev) return;
    const windowId = getActiveWindowId();
    if (!windowId) return;
    platform.toggleShellDevTools(windowId);
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────

  platform.registerLocalShortcut("F12", () => {
    commands.send(DEVTOOLS_TOGGLE, undefined).catch(console.error);
  });

  if (isDev) {
    platform.registerShortcut("F11", () => {
      commands.send(DEVTOOLS_TOGGLE_CHROME, undefined).catch(console.error);
    });
  }

  // ── Tab lifecycle ──────────────────────────────────────────────

  events.on(TABS_CLOSED, ({ tabId }) => {
    openDevTools.delete(tabId);
  });
}

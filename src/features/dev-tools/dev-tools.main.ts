import type { CommandBus } from "../../bus/command-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import { DEVTOOLS_TOGGLE, DEVTOOLS_TOGGLE_CHROME, type DevToolsCommands } from "./dev-tools.shared";

interface Deps {
  commands: CommandBus<DevToolsCommands>;
  platform: Platform;
  isDev: boolean;
  getActiveTabId: () => TabId | undefined;
  getActiveWindowId: () => WindowId | undefined;
}

export function register({
  commands,
  platform,
  isDev,
  getActiveTabId,
  getActiveWindowId,
}: Deps): void {
  // ── Command handlers ───────────────────────────────────────────

  commands.handle(DEVTOOLS_TOGGLE, async () => {
    const tabId = getActiveTabId();
    if (!tabId) return;

    if (platform.isTabDevToolsOpened(tabId)) {
      platform.closeTabDevTools(tabId);
    } else {
      platform.openTabDevTools(tabId, "right");
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
}

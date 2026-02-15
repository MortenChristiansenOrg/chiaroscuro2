import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import type { TabsCommands } from "../tabs/tabs.shared";
import {
  COMMAND_PALETTE_EXECUTE,
  COMMAND_PALETTE_HIDDEN,
  COMMAND_PALETTE_HIDE,
  COMMAND_PALETTE_SHOW,
  COMMAND_PALETTE_SHOWN,
  COMMAND_PALETTE_TOGGLE,
  type CommandPaletteCommands,
  type CommandPaletteEvents,
} from "./command-palette.shared";
import { resolveInput } from "./resolve-input";

type AllCommands = CommandPaletteCommands &
  Pick<TabsCommands, "tabs:activate" | "tabs:create" | "tabs:navigate">;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<CommandPaletteEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
}

export function register({
  commands,
  events,
  platform,
  getActiveWindowId,
  getActiveTabId,
}: Deps): void {
  let isOpen = false;

  commands.handle(COMMAND_PALETTE_SHOW, async () => {
    if (isOpen) return;
    isOpen = true;
    const tabId = getActiveTabId();
    if (tabId) platform.hideTab(tabId);
    const windowId = getActiveWindowId();
    if (windowId) platform.focusShell(windowId);
    events.emit(COMMAND_PALETTE_SHOWN, undefined);
  });

  commands.handle(COMMAND_PALETTE_HIDE, async () => {
    if (!isOpen) return;
    isOpen = false;
    // Re-show active tab by re-activating it (sets bounds)
    const tabId = getActiveTabId();
    if (tabId) {
      await commands.send("tabs:activate", { tabId });
    }
    events.emit(COMMAND_PALETTE_HIDDEN, undefined);
  });

  commands.handle(COMMAND_PALETTE_TOGGLE, async () => {
    if (isOpen) {
      await commands.send(COMMAND_PALETTE_HIDE, undefined);
    } else {
      await commands.send(COMMAND_PALETTE_SHOW, undefined);
    }
  });

  commands.handle(COMMAND_PALETTE_EXECUTE, async (payload) => {
    const url = resolveInput(payload.command);
    if (!url) return;

    if (payload.inCurrentTab) {
      const tabId = getActiveTabId();
      if (tabId) {
        await commands.send("tabs:navigate", { url });
      } else {
        await commands.send("tabs:create", { url });
      }
    } else {
      await commands.send("tabs:create", { url });
    }

    // Auto-hide palette after execution
    await commands.send(COMMAND_PALETTE_HIDE, undefined);
  });

  platform.registerShortcut("CommandOrControl+T", () => {
    commands.send(COMMAND_PALETTE_TOGGLE, undefined).catch(() => {});
  });
}

export function start(_deps: Deps): void {
  // No initial state
}

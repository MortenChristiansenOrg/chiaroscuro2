import type { CommandBus } from "../../bus/command-bus";
import type { Platform } from "../../platform/types";
import { CONTEXT_MENU_SHOW, type ContextMenuCommands } from "./context-menu.shared";

interface Deps {
  commands: CommandBus<ContextMenuCommands>;
  platform: Platform;
}

export function register({ commands, platform }: Deps): void {
  commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
    return platform.showContextMenu(payload);
  });
}

import type { CommandBus } from "../../bus/command-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { CONTEXT_MENU_SHOW, type ContextMenuCommands } from "./context-menu.shared";

interface Deps {
  commands: CommandBus<ContextMenuCommands>;
  platform: Platform;
}

export default defineFeature<Deps>({
  register({ commands, platform }) {
    commands.handle(CONTEXT_MENU_SHOW, async (payload) => {
      return platform.showContextMenu(payload);
    });
  },
});

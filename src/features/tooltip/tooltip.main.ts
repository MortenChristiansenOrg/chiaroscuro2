import type { CommandBus } from "../../bus/command-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { TOOLTIP_HIDE, TOOLTIP_SHOW, type TooltipCommands } from "./tooltip.shared";

interface Deps {
  commands: CommandBus<TooltipCommands>;
  platform: Platform;
}

export default defineFeature<Deps>({
  register({ commands, platform }) {
    commands.handle(TOOLTIP_SHOW, async (payload) => {
      platform.showTooltip(payload);
    });

    commands.handle(TOOLTIP_HIDE, async () => {
      platform.hideTooltip();
    });
  },
});

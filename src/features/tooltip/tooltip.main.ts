import type { CommandBus } from "../../bus/command-bus";
import type { Platform } from "../../platform/types";
import { TOOLTIP_HIDE, TOOLTIP_SHOW, type TooltipCommands } from "./tooltip.shared";

interface Deps {
  commands: CommandBus<TooltipCommands>;
  platform: Platform;
}

export function register({ commands, platform }: Deps): void {
  commands.handle(TOOLTIP_SHOW, async (payload) => {
    platform.showTooltip(payload);
  });

  commands.handle(TOOLTIP_HIDE, async () => {
    platform.hideTooltip();
  });
}

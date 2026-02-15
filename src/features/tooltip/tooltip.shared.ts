export const TOOLTIP_SHOW = "tooltip:show" as const;
export const TOOLTIP_HIDE = "tooltip:hide" as const;

export interface TooltipShowPayload {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TooltipCommands = {
  [TOOLTIP_SHOW]: { payload: TooltipShowPayload; response: undefined };
  [TOOLTIP_HIDE]: { payload: undefined; response: undefined };
};

export type TooltipEvents = Record<string, never>;

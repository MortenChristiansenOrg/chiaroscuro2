export declare const COMMAND_PALETTE_SHOW: "command-palette:show";
export declare const COMMAND_PALETTE_HIDE: "command-palette:hide";
export declare const COMMAND_PALETTE_TOGGLE: "command-palette:toggle";
export declare const COMMAND_PALETTE_SHOWN: "command-palette:shown";
export declare const COMMAND_PALETTE_HIDDEN: "command-palette:hidden";
export type CommandPaletteCommands = {
  [COMMAND_PALETTE_SHOW]: {
    payload: undefined;
    response: undefined;
  };
  [COMMAND_PALETTE_HIDE]: {
    payload: undefined;
    response: undefined;
  };
  [COMMAND_PALETTE_TOGGLE]: {
    payload: undefined;
    response: undefined;
  };
};
export type CommandPaletteEvents = {
  [COMMAND_PALETTE_SHOWN]: undefined;
  [COMMAND_PALETTE_HIDDEN]: undefined;
};

import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_GO_BACK,
  WINDOW_GO_FORWARD,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
  WINDOW_RELOAD,
} from "./window-chrome.shared";

export const commandContracts = {
  [WINDOW_MINIMIZE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Minimize the active browser window.",
    examples: [undefined],
    sideEffects: ["Changes native window state"],
  }),
  [WINDOW_MAXIMIZE_RESTORE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle maximization of the active browser window.",
    examples: [undefined],
    sideEffects: ["Changes native window state"],
  }),
  [WINDOW_CLOSE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Close the active browser window.",
    examples: [undefined],
    sideEffects: ["May quit the application"],
  }),
  [WINDOW_COPY_ADDRESS]: defineCommand(z.undefined(), z.undefined(), {
    description: "Copy the active tab's URL.",
    examples: [undefined],
    sideEffects: ["Writes the system clipboard"],
  }),
  [WINDOW_GO_BACK]: defineCommand(z.undefined(), z.undefined(), {
    description: "Navigate the active tab one history entry backward.",
    examples: [undefined],
    sideEffects: ["Changes the loaded page"],
  }),
  [WINDOW_GO_FORWARD]: defineCommand(z.undefined(), z.undefined(), {
    description: "Navigate the active tab one history entry forward.",
    examples: [undefined],
    sideEffects: ["Changes the loaded page"],
  }),
  [WINDOW_RELOAD]: defineCommand(z.undefined(), z.undefined(), {
    description: "Reload the active tab.",
    examples: [undefined],
    sideEffects: ["Reloads page content"],
  }),
};

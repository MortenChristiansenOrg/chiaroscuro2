import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { PIP_CLOSE, PIP_RETURN_TO_TAB, PIP_TOGGLE_PLAY } from "./pip.shared";

export const commandContracts = {
  [PIP_CLOSE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Close picture-in-picture.",
    examples: [undefined],
    sideEffects: ["Closes the video overlay"],
  }),
  [PIP_TOGGLE_PLAY]: defineCommand(z.undefined(), z.undefined(), {
    description: "Toggle playback in picture-in-picture.",
    examples: [undefined],
    sideEffects: ["Changes video playback"],
  }),
  [PIP_RETURN_TO_TAB]: defineCommand(z.undefined(), z.undefined(), {
    description: "Return from picture-in-picture to its source tab.",
    examples: [undefined],
    sideEffects: ["Changes focus and closes the video overlay"],
  }),
};

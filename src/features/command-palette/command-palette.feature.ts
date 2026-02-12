import { registerFeature } from "../../renderer/src/Shell";
import { CommandPaletteOverlay } from "./command-palette.renderer";
import { subscribeToEvents } from "./command-palette.store";

registerFeature({
  name: "command-palette",
  Overlay: CommandPaletteOverlay,
  subscribeToEvents,
});

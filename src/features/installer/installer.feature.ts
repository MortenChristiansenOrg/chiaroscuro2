import { registerFeature } from "../../renderer/src/Shell";
import { InstallerOverlay } from "./installer.renderer";
import { subscribeToEvents } from "./installer.store";

registerFeature({
  name: "installer",
  Overlay: InstallerOverlay,
  subscribeToEvents,
});

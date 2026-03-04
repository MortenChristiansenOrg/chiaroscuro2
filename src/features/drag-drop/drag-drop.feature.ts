import { registerFeature } from "../../renderer/src/Shell";
import { DragDropOverlay } from "./drag-drop.renderer";

registerFeature({
  name: "drag-drop",
  Overlay: DragDropOverlay,
});

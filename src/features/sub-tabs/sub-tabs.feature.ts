import { registerFeature } from "../../renderer/src/Shell";
import { SubTabOverlay } from "./sub-tabs.renderer";
import { subscribeToEvents } from "./sub-tabs.store";

registerFeature({
  name: "sub-tabs",
  ContentOverlay: SubTabOverlay,
  subscribeToEvents,
});

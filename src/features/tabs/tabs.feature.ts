import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./tabs.store";

registerFeature({
  name: "tabs",
  subscribeToEvents,
});

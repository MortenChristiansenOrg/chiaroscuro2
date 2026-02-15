import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./pinned-tabs.store";

registerFeature({
  name: "pinned-tabs",
  subscribeToEvents,
});

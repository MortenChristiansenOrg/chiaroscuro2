import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./find-text.store";

registerFeature({
  name: "find-text",
  subscribeToEvents,
});

import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./terminal.store";

registerFeature({
  name: "terminal",
  subscribeToEvents,
});

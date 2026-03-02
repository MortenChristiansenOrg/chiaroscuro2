import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./app-state.store";

registerFeature({
  name: "app-state",
  subscribeToEvents,
});

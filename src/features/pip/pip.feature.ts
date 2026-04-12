import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./pip.store";

registerFeature({
  name: "pip",
  subscribeToEvents,
});

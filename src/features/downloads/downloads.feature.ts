import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./downloads.store";

registerFeature({
  name: "downloads",
  subscribeToEvents,
});

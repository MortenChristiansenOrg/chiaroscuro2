import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./folders.store";

registerFeature({
  name: "folders",
  subscribeToEvents,
});

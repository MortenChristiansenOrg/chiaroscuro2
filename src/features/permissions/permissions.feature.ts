import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./permissions.store";

registerFeature({
  name: "permissions",
  subscribeToEvents,
});

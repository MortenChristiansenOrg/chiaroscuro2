import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./workspaces.store";

registerFeature({
  name: "workspaces",
  subscribeToEvents,
});

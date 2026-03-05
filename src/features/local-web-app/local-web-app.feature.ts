import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./local-web-app.store";

registerFeature({
  name: "local-web-app",
  subscribeToEvents,
});

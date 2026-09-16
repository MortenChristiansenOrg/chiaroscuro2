import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./settings.store";

registerBuiltInPage("/settings", () => import("./settings.renderer"));

registerFeature({
  name: "settings",
  subscribeToEvents,
});

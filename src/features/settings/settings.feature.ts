import { registerFeature } from "../../renderer/src/Shell";
import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { subscribeToEvents } from "./settings.store";

registerBuiltInPage("app:settings", () => import("./settings.renderer"));

registerFeature({
  name: "settings",
  subscribeToEvents,
});

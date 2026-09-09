import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./domain-css.store";

registerBuiltInPage("app:domain-settings", () => import("./domain-settings-page"));

registerFeature({
  name: "domain-css",
  subscribeToEvents,
});

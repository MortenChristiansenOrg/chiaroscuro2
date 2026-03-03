import { registerFeature } from "../../renderer/src/Shell";
import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { subscribeToEvents } from "./domain-css.store";

registerBuiltInPage("app:domain-css", () => import("./domain-css.renderer"));

registerFeature({
  name: "domain-css",
  subscribeToEvents,
});

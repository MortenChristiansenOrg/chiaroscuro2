import { registerFeature } from "../../renderer/src/Shell";
import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { subscribeToEvents } from "./extensions.store";

registerBuiltInPage("/extensions", () => import("./extensions.renderer"));

registerFeature({
  name: "extensions",
  subscribeToEvents,
});

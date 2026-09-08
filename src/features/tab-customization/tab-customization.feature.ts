import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./tab-customization.store";

registerBuiltInPage("app:tab-customization", () => import("./tab-customization.renderer"));

registerFeature({
  name: "tab-customization",
  subscribeToEvents,
});

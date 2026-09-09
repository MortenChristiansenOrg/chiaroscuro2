import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./pdf-reader.store";

registerBuiltInPage("app:pdf-reader", () => import("./pdf-reader.renderer"));

registerFeature({
  name: "pdf-reader",
  subscribeToEvents,
});

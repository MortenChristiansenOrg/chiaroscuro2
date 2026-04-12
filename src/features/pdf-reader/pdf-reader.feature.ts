import { registerFeature } from "../../renderer/src/Shell";
import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { subscribeToEvents } from "./pdf-reader.store";

registerBuiltInPage("/pdf-reader", () => import("./pdf-reader.renderer"));

registerFeature({
  name: "pdf-reader",
  subscribeToEvents,
});

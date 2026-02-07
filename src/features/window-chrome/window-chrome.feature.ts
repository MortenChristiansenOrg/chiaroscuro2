import { registerFeature } from "../../renderer/src/Shell";
import { TitleBar } from "./window-chrome.renderer";
import { subscribeToEvents } from "./window-chrome.store";

registerFeature({
  name: "window-chrome",
  Chrome: TitleBar,
  subscribeToEvents,
});

import { registerFeature } from "../../renderer/src/Shell";
import { SidebarPanel } from "./sidebar.renderer";
import { subscribeToEvents } from "./sidebar.store";

registerFeature({
  name: "sidebar",
  Sidebar: SidebarPanel,
  subscribeToEvents,
});

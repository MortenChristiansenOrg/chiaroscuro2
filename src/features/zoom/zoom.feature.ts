import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./zoom.store";

registerFeature({ name: "zoom", subscribeToEvents });

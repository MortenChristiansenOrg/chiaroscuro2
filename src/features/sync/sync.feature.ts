import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./sync.store";

registerFeature({ name: "sync", subscribeToEvents });

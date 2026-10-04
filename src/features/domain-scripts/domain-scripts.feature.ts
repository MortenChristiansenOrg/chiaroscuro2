import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./domain-scripts.store";

registerFeature({ name: "domain-scripts", subscribeToEvents });

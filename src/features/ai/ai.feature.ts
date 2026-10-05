import { registerFeature } from "../../renderer/src/Shell";
import { subscribeToEvents } from "./ai.store";

registerFeature({ name: "ai", subscribeToEvents });

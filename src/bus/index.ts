export { CommandBus } from "./command-bus";
export { EventBus } from "./event-bus";
export type { CommandRegistry, EventRegistry, MergeRegistries } from "./types";

// IPC modules imported directly by each process:
//   Main:     import { bridgeBusToIpc } from "../bus/ipc-main-bridge"
//   Renderer: import { IpcRendererCommandBus, IpcRendererEventBus } from "../bus/ipc-renderer-bus"

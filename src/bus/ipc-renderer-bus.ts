import type { CommandRegistry, EventRegistry } from "./types";

type Listener<P> = (payload: P) => void;
type Unsubscribe = () => void;

interface PreloadApi {
  sendCommand: (name: string, payload: unknown) => Promise<unknown>;
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void;
}

function getApi(): PreloadApi {
  // biome-ignore lint/suspicious/noExplicitAny: window.chiaroscuro defined by preload
  return (window as any).chiaroscuro as PreloadApi;
}

/** CommandBus proxy that forwards commands to main process via IPC */
export class IpcRendererCommandBus<TRegistry extends CommandRegistry> {
  async send<K extends string & keyof TRegistry>(
    name: K,
    payload: TRegistry[K]["payload"],
  ): Promise<TRegistry[K]["response"]> {
    return getApi().sendCommand(name, payload) as Promise<TRegistry[K]["response"]>;
  }
}

/** EventBus proxy that receives events from main process via IPC */
export class IpcRendererEventBus<TRegistry extends EventRegistry> {
  on<K extends string & keyof TRegistry>(name: K, listener: Listener<TRegistry[K]>): Unsubscribe {
    return getApi().onEvent(name, listener as Listener<unknown>);
  }
}

import type { EventRegistry } from "./types";

type Listener<P> = (payload: P) => void;
type Unsubscribe = () => void;

export class EventBus<TRegistry extends EventRegistry> {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends string & keyof TRegistry>(name: K, listener: Listener<TRegistry[K]>): Unsubscribe {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    const wrapped = listener as Listener<unknown>;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  getListenerNames(): string[] {
    return [...this.listeners.keys()];
  }

  emit<K extends string & keyof TRegistry>(name: K, payload: TRegistry[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of set) {
      listener(payload);
    }
  }
}

import type { CommandRegistry } from "./types";

type Handler<P, R> = (payload: P) => R | Promise<R> | void | Promise<void>;

export class CommandBus<TRegistry extends CommandRegistry> {
  private handlers = new Map<string, Handler<unknown, unknown>>();

  handle<K extends string & keyof TRegistry>(
    name: K,
    handler: Handler<TRegistry[K]["payload"], TRegistry[K]["response"]>,
  ): void {
    if (this.handlers.has(name)) {
      throw new Error(`Command "${name}" already has a handler`);
    }
    this.handlers.set(name, handler as Handler<unknown, unknown>);
  }

  unhandle<K extends string & keyof TRegistry>(name: K): void {
    this.handlers.delete(name);
  }

  hasHandler(name: string): boolean {
    return this.handlers.has(name);
  }

  getHandlerNames(): string[] {
    return [...this.handlers.keys()];
  }

  async send<K extends string & keyof TRegistry>(
    name: K,
    payload: TRegistry[K]["payload"],
  ): Promise<TRegistry[K]["response"]> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for command "${name}"`);
    }
    return handler(payload) as Promise<TRegistry[K]["response"]>;
  }
}

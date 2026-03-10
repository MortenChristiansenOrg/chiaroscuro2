import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { CommandRegistry, EventRegistry } from "../../bus/types";

export interface RecordedEntry {
  id: number;
  timestamp: number;
  type: "command" | "event" | "registration";
  name: string;
  payload?: unknown;
  response?: unknown;
  error?: string;
  durationMs?: number;
}

const MAX_ENTRIES = 1000;
let nextId = 1;
const buffer: RecordedEntry[] = [];

function safeCopy(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
}

function push(entry: RecordedEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

let registered = false;

export function register<C extends CommandRegistry, E extends EventRegistry>(
  commandBus: CommandBus<C>,
  eventBus: EventBus<E>,
): void {
  if (registered) return;
  registered = true;

  // Patch commandBus.handle to record registrations
  const originalHandle = commandBus.handle.bind(commandBus);
  commandBus.handle = (<K extends string & keyof C>(
    name: K,
    handler: (payload: C[K]["payload"]) => C[K]["response"] | Promise<C[K]["response"]>,
  ) => {
    push({
      id: nextId++,
      timestamp: Date.now(),
      type: "registration",
      name: name as string,
    });
    return originalHandle(name, handler);
  }) as typeof commandBus.handle;

  // Patch commandBus.send to record commands
  const originalSend = commandBus.send.bind(commandBus);
  commandBus.send = (async <K extends string & keyof C>(
    name: K,
    payload: C[K]["payload"],
  ): Promise<C[K]["response"]> => {
    const entry: RecordedEntry = {
      id: nextId++,
      timestamp: Date.now(),
      type: "command",
      name: name as string,
      payload: safeCopy(payload),
    };
    const start = performance.now();
    try {
      const response = await originalSend(name, payload);
      entry.durationMs = Math.round((performance.now() - start) * 100) / 100;
      entry.response = safeCopy(response);
      push(entry);
      return response;
    } catch (err) {
      entry.durationMs = Math.round((performance.now() - start) * 100) / 100;
      entry.error = err instanceof Error ? err.message : String(err);
      push(entry);
      throw err;
    }
  }) as typeof commandBus.send;

  // Patch eventBus.emit to record events
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = (<K extends string & keyof E>(name: K, payload: E[K]): void => {
    push({
      id: nextId++,
      timestamp: Date.now(),
      type: "event",
      name: name as string,
      payload: safeCopy(payload),
    });
    originalEmit(name, payload);
  }) as typeof eventBus.emit;
}

export function getHistory(): readonly RecordedEntry[] {
  return buffer;
}

export function clearHistory(): void {
  buffer.length = 0;
}

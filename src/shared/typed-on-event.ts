import type { EventRegistry } from "../bus/types";

/** Untyped onEvent signature as exposed by the preload API. */
type UntypedOnEvent = (name: string, callback: (payload: unknown) => void) => () => void;

/**
 * Wraps an untyped `onEvent` (from the preload bridge) with compile-time
 * payload types derived from the event registry `TRegistry`.
 *
 * Usage in stores:
 * ```ts
 * const on = typedOnEvent<MyEvents>(onEvent);
 * on("my:event", ({ field }) => { ... }); // field is typed
 * ```
 */
export function typedOnEvent<TRegistry extends EventRegistry>(onEvent: UntypedOnEvent) {
  return <K extends string & keyof TRegistry>(name: K, callback: (payload: TRegistry[K]) => void) =>
    onEvent(name, callback as (payload: unknown) => void);
}

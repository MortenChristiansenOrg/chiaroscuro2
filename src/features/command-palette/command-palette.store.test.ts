import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_PALETTE_HIDDEN, COMMAND_PALETTE_SHOWN } from "./command-palette.shared";
import { subscribeToEvents, useCommandPaletteStore } from "./command-palette.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

describe("command-palette.store", () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ open: false });
  });

  it("COMMAND_PALETTE_SHOWN sets open to true", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(COMMAND_PALETTE_SHOWN)?.(undefined);
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it("COMMAND_PALETTE_HIDDEN sets open to false", () => {
    const { handlers, onEvent } = setupEventBus();
    useCommandPaletteStore.setState({ open: true });
    subscribeToEvents(onEvent);

    handlers.get(COMMAND_PALETTE_HIDDEN)?.(undefined);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("unsub removes all listeners", () => {
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);
    expect(handlers.size).toBe(2);

    unsub();
    expect(handlers.size).toBe(0);
  });
});

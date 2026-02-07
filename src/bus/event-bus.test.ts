import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./event-bus";

type TestEvents = {
  "test:created": { id: string };
  "test:deleted": { id: string };
};

describe("EventBus", () => {
  it("delivers event to listener", () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    bus.on("test:created", listener);

    bus.emit("test:created", { id: "1" });
    expect(listener).toHaveBeenCalledWith({ id: "1" });
  });

  it("delivers to multiple listeners", () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("test:created", a);
    bus.on("test:created", b);

    bus.emit("test:created", { id: "1" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribes via returned function", () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    const unsub = bus.on("test:created", listener);

    unsub();
    bus.emit("test:created", { id: "1" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not cross-deliver between event names", () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    bus.on("test:created", listener);

    bus.emit("test:deleted", { id: "1" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("handles emit with no listeners gracefully", () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit("test:created", { id: "1" })).not.toThrow();
  });
});

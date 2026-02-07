import { describe, expect, it } from "vitest";
import { CommandBus } from "./command-bus";

type TestCommands = {
  "test:greet": { payload: { name: string }; response: string };
  "test:add": { payload: { a: number; b: number }; response: number };
};

describe("CommandBus", () => {
  it("sends command to registered handler and returns response", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.handle("test:greet", ({ name }) => `Hello, ${name}`);

    const result = await bus.send("test:greet", { name: "World" });
    expect(result).toBe("Hello, World");
  });

  it("supports async handlers", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.handle("test:add", async ({ a, b }) => a + b);

    const result = await bus.send("test:add", { a: 2, b: 3 });
    expect(result).toBe(5);
  });

  it("throws when sending unhandled command", async () => {
    const bus = new CommandBus<TestCommands>();
    await expect(bus.send("test:greet", { name: "x" })).rejects.toThrow(
      'No handler registered for command "test:greet"',
    );
  });

  it("throws when registering duplicate handler", () => {
    const bus = new CommandBus<TestCommands>();
    bus.handle("test:greet", () => "hi");
    expect(() => bus.handle("test:greet", () => "bye")).toThrow(
      'Command "test:greet" already has a handler',
    );
  });

  it("allows re-registering after unhandle", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.handle("test:greet", () => "first");
    bus.unhandle("test:greet");
    bus.handle("test:greet", () => "second");

    const result = await bus.send("test:greet", { name: "x" });
    expect(result).toBe("second");
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";

beforeEach(() => vi.resetModules());

it("does not serialize payloads with recording disabled and can resume on demand", async () => {
  const recorder = await import("./recorder");
  const commands = new CommandBus<{ echo: { payload: object; response: object } }>();
  const events = new EventBus<{ changed: object }>();
  recorder.register(commands, events);
  commands.handle("echo", (payload) => payload);
  const toJSON = vi.fn(() => ({ value: "copied" }));
  const payload = { toJSON };
  const observed = vi.fn();
  events.on("changed", observed);
  expect(await commands.send("echo", payload)).toBe(payload);
  events.emit("changed", payload);
  expect(observed).toHaveBeenCalledWith(payload);
  expect(toJSON).not.toHaveBeenCalled();
  expect(recorder.getHistory()).toEqual([]);
  recorder.setRecordingEnabled(true);
  await commands.send("echo", payload);
  events.emit("changed", payload);
  expect(toJSON).toHaveBeenCalledTimes(3);
  expect(recorder.getHistory()).toHaveLength(2);
  recorder.setRecordingEnabled(false);
  expect(recorder.getHistory()).toEqual([]);
});

it("does not retain a pending command after recording is disabled and re-enabled", async () => {
  const recorder = await import("./recorder");
  const commands = new CommandBus<{ wait: { payload: undefined; response: object } }>();
  recorder.register(commands, new EventBus(), true);
  let complete: (value: object) => void = () => {};
  commands.handle(
    "wait",
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = commands.send("wait", undefined);
  recorder.setRecordingEnabled(false);
  recorder.setRecordingEnabled(true);
  const toJSON = vi.fn();
  complete({ toJSON });
  await pending;
  expect(toJSON).not.toHaveBeenCalled();
  expect(recorder.getHistory()).toEqual([]);
});

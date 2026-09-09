import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CommandBus } from "./command-bus";
import { commandContracts } from "./command-contracts";
import { documentCommand, executeExternalCommand } from "./command-validation";
import { type CommandTypes, defineCommand } from "./contract";

const contracts = {
  update: defineCommand(
    z.strictObject({ count: z.number().int().nonnegative(), label: z.string().optional() }),
    z.number(),
    { description: "Update a counter", examples: [{ count: 1 }], sideEffects: ["Changes counter"] },
  ),
  read: defineCommand(z.undefined(), z.number(), {
    description: "Read counter",
    examples: [undefined],
    sideEffects: [],
  }),
};
function fixture() {
  const bus = new CommandBus<CommandTypes<typeof contracts>>(contracts);
  const handler = vi.fn(({ count }: { count: number }) => count);
  bus.handle("update", handler);
  bus.handle("read", () => 7);
  return { bus, handler };
}

describe("external commands", () => {
  it("validates and normalizes optional fields before invoking a handler", async () => {
    const { bus, handler } = fixture();
    expect(await executeExternalCommand(bus, "update", { count: 3, label: undefined })).toEqual({
      ok: true,
      response: 3,
    });
    expect(handler).toHaveBeenCalledWith({ count: 3 });
    expect(await executeExternalCommand(bus, "read", null)).toEqual({ ok: true, response: 7 });
    expect(await executeExternalCommand(bus, "read", undefined)).toEqual({ ok: true, response: 7 });
    expect(await executeExternalCommand(bus, "read", {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });
  });

  it.each([
    null,
    {},
    { count: "3" },
    { count: -1 },
    { count: 1.5 },
    { count: 3, extra: true },
    { count: Number.NaN },
    { count: Infinity },
  ])("rejects invalid values without mutation: %j", async (payload) => {
    const { bus, handler } = fixture();
    expect(await executeExternalCommand(bus, "update", payload)).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD", command: "update", issues: expect.any(Array) },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects values that IPC can carry but JSON cannot represent", async () => {
    const { bus, handler } = fixture();
    const cyclic: Record<string, unknown> = { count: 1 };
    cyclic.self = cyclic;
    for (const payload of [
      cyclic,
      new Date(),
      new Map(),
      new Uint8Array([1]),
      { count: 1, label: 1n },
      { count: 1, label: () => {} },
      { count: 1, label: [undefined] },
    ]) {
      expect(await executeExternalCommand(bus, "update", payload)).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_PAYLOAD",
          issues: [expect.objectContaining({ code: "non_json_value" })],
        },
      });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not execute object getters during validation", async () => {
    const { bus, handler } = fixture();
    const getter = vi.fn(() => 1);
    const payload = Object.defineProperty({}, "count", { enumerable: true, get: getter });
    expect(await executeExternalCommand(bus, "update", payload)).toMatchObject({ ok: false });
    expect(getter).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed for unknown or undocumented handlers", async () => {
    const { bus } = fixture();
    expect(await executeExternalCommand(bus, "toString", {})).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_COMMAND" },
    });
    expect(await executeExternalCommand(bus, 42, {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMMAND" },
    });
    const internal = new CommandBus<{ internal: { payload: undefined; response: undefined } }>();
    const handler = vi.fn();
    internal.handle("internal", handler);
    expect(await executeExternalCommand(internal, "internal", undefined)).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_COMMAND" },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

it("publishes usable schemas and valid examples for every app command", () => {
  for (const [name, contract] of Object.entries(commandContracts)) {
    expect(contract.description.length, name).toBeGreaterThan(10);
    expect(contract.examples.length, name).toBeGreaterThan(0);
    for (const example of contract.examples)
      expect(contract.payload.safeParse(example).success, name).toBe(true);
    const document = documentCommand(name, contract);
    expect(document.payload.schema, name).not.toBeNull();
    expect(document.response.schema, name).not.toBeNull();
    expect(() => JSON.stringify(document), name).not.toThrow();
  }
  expect(documentCommand("read", contracts.read).payload).toEqual({
    schema: { type: "null" },
    acceptsOmitted: true,
  });
  expect(
    documentCommand("tabs:create", commandContracts["tabs:create"]).payload.schema,
  ).toMatchObject({ required: ["url"], additionalProperties: false });
});

it("defaults omitted workspace privacy mode without weakening explicit boolean validation", async () => {
  const bus = new CommandBus<Record<string, { payload: unknown; response: unknown }>>(
    commandContracts,
  );
  const handler = vi.fn();
  bus.handle("workspaces:create", handler);
  expect(
    await executeExternalCommand(bus, "workspaces:create", {
      name: "Work",
      color: "blue",
      icon: "W",
    }),
  ).toMatchObject({ ok: true });
  expect(handler).toHaveBeenCalledWith({
    name: "Work",
    color: "blue",
    icon: "W",
    privacyMode: false,
  });
  expect(
    await executeExternalCommand(bus, "workspaces:create", {
      name: "Work",
      color: "blue",
      icon: "W",
      privacyMode: "false",
    }),
  ).toMatchObject({ ok: false });
  expect(handler).toHaveBeenCalledOnce();
});

it("documents response output rather than a schema's intermediate input", () => {
  const contract = defineCommand(z.undefined(), z.string().transform(Number).pipe(z.number()), {
    description: "Return a parsed number",
    examples: [undefined],
    sideEffects: [],
  });
  expect(documentCommand("parsed-number", contract).response.schema).toMatchObject({
    type: "number",
  });
});

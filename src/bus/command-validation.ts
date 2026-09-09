import { z } from "zod";
import type { CommandBus } from "./command-bus";
import type { CommandContract } from "./contract";
import type { CommandRegistry } from "./types";

export interface CommandError {
  code: "INVALID_COMMAND" | "INVALID_PAYLOAD" | "UNKNOWN_COMMAND" | "FORBIDDEN" | "COMMAND_FAILED";
  message: string;
  command?: string;
  issues?: { path: (string | number)[]; code: string; message: string }[];
}
export type CommandResult = { ok: true; response: unknown } | { ok: false; error: CommandError };

/** JSON-compatible IPC payloads may omit undefined object fields, as JSON.stringify does.
 * Unlike JSON.stringify, reject lossy arrays, non-finite numbers, classes, cycles and accessors. */
function jsonValue(
  value: unknown,
  path: (string | number)[] = [],
  ancestors = new Set<object>(),
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const invalid = () => {
    throw {
      path,
      code: "non_json_value",
      message:
        "Expected a finite JSON value (no cycles, functions, binary data, or class instances)",
    };
  };
  if (typeof value !== "object" || !value) return invalid();
  if (ancestors.has(value) || path.length > 100) return invalid();
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return invalid();
  if (Object.getOwnPropertySymbols(value).length) return invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !("value" in descriptor)) return invalid();
        result.push(jsonValue(descriptor.value, [...path, i], ancestors));
      }
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in descriptor)) return invalid();
      if (descriptor.value !== undefined)
        result[key] = jsonValue(descriptor.value, [...path, key], ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export async function executeExternalCommand<C extends CommandRegistry>(
  bus: CommandBus<C>,
  name: unknown,
  payload: unknown,
): Promise<CommandResult> {
  if (typeof name !== "string" || !name.length)
    return {
      ok: false,
      error: { code: "INVALID_COMMAND", message: "Command name must be a nonempty string" },
    };
  const contract = bus.getContract(name);
  if (!bus.hasHandler(name) || !contract)
    return {
      ok: false,
      error: {
        code: "UNKNOWN_COMMAND",
        command: name,
        message: `No externally documented handler for command: ${name}`,
      },
    };
  let normalized: unknown;
  try {
    // Only schemas that accept undefined allow an omitted or null top-level payload.
    normalized =
      payload === undefined || (payload === null && contract.payload.safeParse(undefined).success)
        ? undefined
        : jsonValue(payload);
  } catch (issue) {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        command: name,
        message: `Invalid payload for ${name}`,
        issues: [issue as NonNullable<CommandError["issues"]>[number]],
      },
    };
  }
  const parsed = contract.payload.safeParse(normalized);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        command: name,
        message: `Invalid payload for ${name}`,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map((p) => (typeof p === "number" ? p : String(p))),
          code: issue.code,
          message: issue.message,
        })),
      },
    };
  try {
    return {
      ok: true,
      response: await bus.send(
        name as string & keyof C,
        parsed.data as C[string & keyof C]["payload"],
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "COMMAND_FAILED",
        command: name,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function schemaDocumentation(schema: z.ZodType, io: "input" | "output") {
  // Undefined has no JSON representation. Preserve that distinction without publishing {}.
  if (schema instanceof z.ZodUndefined) return { schema: { type: "null" }, acceptsOmitted: true };
  try {
    return {
      schema: z.toJSONSchema(schema, {
        io,
        unrepresentable: ({ zodSchema }) =>
          zodSchema instanceof z.ZodUndefined ? { type: "null" } : "throw",
      }),
      acceptsOmitted: schema.safeParse(undefined).success,
    };
  } catch {
    return {
      schema: null,
      acceptsOmitted: schema.safeParse(undefined).success,
      unrepresentable: "This contract includes values that JSON Schema cannot describe",
    };
  }
}

export function documentCommand(name: string, contract: CommandContract) {
  return {
    name,
    description: contract.description,
    examples: contract.examples.map((payload) => ({ name, payload: payload ?? null })),
    sideEffects: contract.sideEffects,
    payload: schemaDocumentation(contract.payload, "input"),
    response: schemaDocumentation(contract.response, "output"),
  };
}

export function commandErrorStatus(error: CommandError): number {
  return error.code === "FORBIDDEN"
    ? 403
    : error.code === "UNKNOWN_COMMAND"
      ? 404
      : error.code === "COMMAND_FAILED"
        ? 500
        : 400;
}

import type { JsonValue } from "./app-data-client.main";

/** `undefined` stands for a property that is absent. */
type Value = JsonValue | undefined;

function isRecord(value: Value): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A property of parsed JSON; inherited ones, such as `constructor`, are absent. */
function own(value: { [key: string]: JsonValue } | undefined, key: string): Value {
  return value && Object.hasOwn(value, key) ? value[key] : undefined;
}

/** Deep equality for JSON values; property order does not matter. */
export function jsonEqual(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!jsonEqual(own(a, key), own(b, key))) return false;
  return true;
}

export type MergeResult = { merged: true; value: Value } | { merged: false };

/**
 * Three-way merge of two versions that both changed since `base`. Objects merge property by
 * property, so changes to different properties combine. A property both sides changed to
 * different values is a conflict, and so is anything that isn't an object on both sides.
 * An absent base (`undefined`) merges two independently created objects the same way.
 */
export function merge3(base: Value, local: Value, remote: Value): MergeResult {
  if (jsonEqual(local, remote)) return { merged: true, value: local };
  if (jsonEqual(local, base)) return { merged: true, value: remote };
  if (jsonEqual(remote, base)) return { merged: true, value: local };
  if (!isRecord(local) || !isRecord(remote) || !(base === undefined || isRecord(base)))
    return { merged: false };
  // Built without a prototype, so any JSON property name is just data.
  const result: { [key: string]: JsonValue } = Object.create(null);
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  for (const key of keys) {
    const merged = merge3(own(base, key), own(local, key), own(remote, key));
    if (!merged.merged) return merged;
    if (merged.value !== undefined) result[key] = merged.value;
  }
  return { merged: true, value: result };
}

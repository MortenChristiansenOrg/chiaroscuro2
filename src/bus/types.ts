/** Maps command/event names to their payload+response types */
export type CommandRegistry = Record<string, { payload: unknown; response: unknown }>;
export type EventRegistry = Record<string, unknown>;

/** Merge multiple registries into one (union of keys) */
export type MergeRegistries<T extends readonly unknown[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? First & MergeRegistries<Rest>
  : // biome-ignore lint/complexity/noBannedTypes: empty object is correct for base case
    {};

/**
 * Encapsulates module-level feature state with lifecycle management.
 *
 * Solves:
 * - Test isolation: reset() clears state between tests
 * - GC: teardown releases references
 * - Fail-fast: get() throws if accessed before register()
 */
export interface FeatureState<T> {
  /** Initialize state during register(). */
  init(value: T): void;
  /** Get initialized state. Throws if not initialized. */
  get(): T;
  /** Reset state for teardown/test isolation. */
  reset(): void;
  /** Whether state has been initialized. */
  readonly initialized: boolean;
}

export function featureState<T>(name: string): FeatureState<T> {
  let value: T | undefined;
  return {
    init(v: T) {
      value = v;
    },
    get(): T {
      if (value === undefined) {
        throw new Error(`Feature "${name}" not initialized — call register() first`);
      }
      return value;
    },
    reset() {
      value = undefined;
    },
    get initialized() {
      return value !== undefined;
    },
  };
}

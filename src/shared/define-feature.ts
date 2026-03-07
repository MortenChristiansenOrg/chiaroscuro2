/**
 * Thin wrapper to define a main-process feature with typed register/start/teardown.
 * Provides a consistent shape and eliminates aliased imports in index.ts.
 */
export interface Feature<TDeps, TStartDeps = TDeps, TStartResult = void> {
  register: (deps: TDeps) => void;
  start?: (deps: TStartDeps, ...args: never[]) => TStartResult | Promise<TStartResult>;
  teardown?: () => void;
}

export function defineFeature<TDeps, TStartDeps = TDeps, TStartResult = void>(
  feature: Feature<TDeps, TStartDeps, TStartResult>,
): Feature<TDeps, TStartDeps, TStartResult> {
  return feature;
}

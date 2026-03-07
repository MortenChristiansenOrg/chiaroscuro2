type StateProvider = () => unknown;

const providers = new Map<string, StateProvider>();

export function registerDebugState(name: string, provider: StateProvider): void {
  providers.set(name, provider);
}

export function getDebugState(name?: string): Record<string, unknown> {
  if (name) {
    const provider = providers.get(name);
    if (!provider) return {};
    return { [name]: provider() };
  }
  const result: Record<string, unknown> = {};
  for (const [key, provider] of providers) {
    result[key] = provider();
  }
  return result;
}

export function getDebugStateNames(): string[] {
  return [...providers.keys()];
}

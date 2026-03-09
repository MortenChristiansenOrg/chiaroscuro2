type StateProvider = () => unknown;

const providers = new Map<string, StateProvider>();

export function registerDebugState(name: string, provider: StateProvider): void {
  providers.set(name, provider);
}

export async function getDebugState(name?: string): Promise<Record<string, unknown>> {
  if (name) {
    const provider = providers.get(name);
    if (!provider) return {};
    return { [name]: await provider() };
  }
  const entries = await Promise.all(
    [...providers].map(async ([key, provider]) => [key, await provider()] as const),
  );
  return Object.fromEntries(entries);
}

export function getDebugStateNames(): string[] {
  return [...providers.keys()];
}

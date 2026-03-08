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
  const result: Record<string, unknown> = {};
  const entries = [...providers].map(async ([key, provider]) => {
    result[key] = await provider();
  });
  await Promise.all(entries);
  return result;
}

export function getDebugStateNames(): string[] {
  return [...providers.keys()];
}

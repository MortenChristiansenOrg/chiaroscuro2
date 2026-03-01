import { type ComponentType, type LazyExoticComponent, Suspense, lazy } from "react";

const registry = new Map<string, LazyExoticComponent<ComponentType>>();

export function registerBuiltInPage(
  url: string,
  loader: () => Promise<{ default: ComponentType }>,
): void {
  registry.set(url, lazy(loader));
}

export function BuiltInPage({ url }: { url: string }) {
  const Component = registry.get(url);
  if (!Component) return null;
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

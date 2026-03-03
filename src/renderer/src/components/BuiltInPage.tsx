import { type ComponentType, type LazyExoticComponent, Suspense, lazy } from "react";

export interface BuiltInPageProps {
  params: Record<string, string>;
}

const registry = new Map<string, LazyExoticComponent<ComponentType<BuiltInPageProps>>>();

export function registerBuiltInPage(
  url: string,
  loader: () => Promise<{ default: ComponentType<BuiltInPageProps> }>,
): void {
  registry.set(url, lazy(loader));
}

function parseBuiltInUrl(url: string): { base: string; params: Record<string, string> } {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return { base: url, params: {} };

  const base = url.slice(0, qIndex);
  const params: Record<string, string> = {};
  const search = url.slice(qIndex + 1);
  for (const pair of search.split("&")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      params[decodeURIComponent(pair)] = "";
    } else {
      params[decodeURIComponent(pair.slice(0, eqIndex))] = decodeURIComponent(
        pair.slice(eqIndex + 1),
      );
    }
  }
  return { base, params };
}

export function BuiltInPage({ url }: { url: string }) {
  const { base, params } = parseBuiltInUrl(url);
  const Component = registry.get(base);
  if (!Component) return null;
  return (
    <Suspense fallback={null}>
      <Component params={params} />
    </Suspense>
  );
}

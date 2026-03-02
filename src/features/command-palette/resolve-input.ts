// ── Types ───────────────────────────────────────────────────────

export interface SearchProvider {
  bang: string;
  name: string;
  icon?: string;
  urlTemplate: string; // e.g. "https://www.google.com/search?q={query}"
}

export type ResolvedInput =
  | { type: "search"; provider: string; query: string; url: string }
  | { type: "url"; url: string }
  | { type: "empty" };

// ── Default providers ───────────────────────────────────────────

export const DEFAULT_PROVIDERS: SearchProvider[] = [
  {
    bang: "!d",
    name: "DuckDuckGo",
    icon: "magnifying-glass",
    urlTemplate: "https://duckduckgo.com/?q={query}",
  },
  {
    bang: "!g",
    name: "Google",
    icon: "magnifying-glass",
    urlTemplate: "https://www.google.com/search?q={query}",
  },
  {
    bang: "!gh",
    name: "GitHub",
    icon: "magnifying-glass",
    urlTemplate: "https://github.com/search?q={query}",
  },
  {
    bang: "!yt",
    name: "YouTube",
    icon: "magnifying-glass",
    urlTemplate: "https://www.youtube.com/results?search_query={query}",
  },
  {
    bang: "!w",
    name: "Wikipedia",
    icon: "magnifying-glass",
    urlTemplate: "https://en.wikipedia.org/w/index.php?search={query}",
  },
];

export interface ProviderConfig {
  providers: SearchProvider[];
  defaultBang: string;
}

export const DEFAULT_CONFIG: ProviderConfig = {
  providers: DEFAULT_PROVIDERS,
  defaultBang: "!g",
};

// ── Built-in pages ──────────────────────────────────────────────

export interface BuiltInPage {
  route: string; // e.g. "/settings"
  url: string; // e.g. "app:settings"
  title: string; // e.g. "Settings"
}

const builtInPages: BuiltInPage[] = [
  { route: "/settings", title: "Settings", url: "app:settings" },
];

const builtInRoutes: Record<string, string> = Object.fromEntries(
  builtInPages.map((p) => [p.route, p.url]),
);

export function getBuiltInPages(): BuiltInPage[] {
  return builtInPages;
}

// ── Resolution ──────────────────────────────────────────────────

/**
 * Resolve a raw command-palette input string into a typed resolution.
 * Returns the resolution type + metadata for UI feedback.
 */
export function resolveInputDetailed(
  input: string,
  config: ProviderConfig = DEFAULT_CONFIG,
): ResolvedInput {
  const trimmed = input.trim();
  if (!trimmed) return { type: "empty" };

  const findProvider = (bang: string) => config.providers.find((p) => p.bang === bang);
  const buildUrl = (p: SearchProvider, q: string) =>
    p.urlTemplate.replace("{query}", encodeURIComponent(q));
  const getDefault = () =>
    (findProvider(config.defaultBang) ??
      config.providers[0] ??
      DEFAULT_PROVIDERS[0]) as SearchProvider;

  // Built-in page route
  const builtInUrl = builtInRoutes[trimmed];
  if (builtInUrl) return { type: "url", url: builtInUrl };

  // Bang at start: !g query
  const bangStartMatch = trimmed.match(/^(![\w]+)\s+(.+)/);
  if (bangStartMatch?.[1] && bangStartMatch[2]) {
    const provider = findProvider(bangStartMatch[1]);
    if (provider) {
      return {
        type: "search",
        provider: provider.name,
        query: bangStartMatch[2],
        url: buildUrl(provider, bangStartMatch[2]),
      };
    }
  }

  // Bang at end: query !g
  const bangEndMatch = trimmed.match(/^(.+)\s+(![\w]+)$/);
  if (bangEndMatch?.[1] && bangEndMatch[2]) {
    const provider = findProvider(bangEndMatch[2]);
    if (provider) {
      return {
        type: "search",
        provider: provider.name,
        query: bangEndMatch[1],
        url: buildUrl(provider, bangEndMatch[1]),
      };
    }
  }

  // Has explicit protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", url: trimmed };
  }

  // Contains a space → search (unless matched by bang above)
  if (trimmed.includes(" ")) {
    const dp = getDefault();
    return {
      type: "search",
      provider: dp.name,
      query: trimmed,
      url: buildUrl(dp, trimmed),
    };
  }

  // localhost or localhost:port
  if (/^localhost(:\d+)?/i.test(trimmed)) {
    return { type: "url", url: `http://${trimmed}` };
  }

  // Has dot, no spaces → URL
  if (trimmed.includes(".")) {
    return { type: "url", url: `https://${trimmed}` };
  }

  // Default: search
  const dp = getDefault();
  return {
    type: "search",
    provider: dp.name,
    query: trimmed,
    url: buildUrl(dp, trimmed),
  };
}

/**
 * Legacy API — returns the resolved URL string.
 */
export function resolveInput(input: string, config: ProviderConfig = DEFAULT_CONFIG): string {
  const result = resolveInputDetailed(input, config);
  if (result.type === "empty") return "";
  return result.url;
}

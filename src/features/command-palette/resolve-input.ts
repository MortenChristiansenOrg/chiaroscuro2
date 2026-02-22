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

let _providers: SearchProvider[] = DEFAULT_PROVIDERS;
let _defaultProviderBang = "!d";

export function setProviders(providers: SearchProvider[]): void {
  _providers = providers;
}

export function setDefaultProvider(bang: string): void {
  _defaultProviderBang = bang;
}

export function getProviders(): SearchProvider[] {
  return _providers;
}

function findProvider(bang: string): SearchProvider | undefined {
  return _providers.find((p) => p.bang === bang);
}

function getDefaultProvider(): SearchProvider {
  return (findProvider(_defaultProviderBang) ??
    _providers[0] ??
    DEFAULT_PROVIDERS[0]) as SearchProvider;
}

function buildSearchUrl(provider: SearchProvider, query: string): string {
  return provider.urlTemplate.replace("{query}", encodeURIComponent(query));
}

// ── Resolution ──────────────────────────────────────────────────

/**
 * Resolve a raw command-palette input string into a typed resolution.
 * Returns the resolution type + metadata for UI feedback.
 */
export function resolveInputDetailed(input: string): ResolvedInput {
  const trimmed = input.trim();
  if (!trimmed) return { type: "empty" };

  // Bang at start: !g query
  const bangStartMatch = trimmed.match(/^(![\w]+)\s+(.+)/);
  if (bangStartMatch?.[1] && bangStartMatch[2]) {
    const provider = findProvider(bangStartMatch[1]);
    if (provider) {
      return {
        type: "search",
        provider: provider.name,
        query: bangStartMatch[2],
        url: buildSearchUrl(provider, bangStartMatch[2]),
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
        url: buildSearchUrl(provider, bangEndMatch[1]),
      };
    }
  }

  // Has explicit protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", url: trimmed };
  }

  // Contains a space → search (unless matched by bang above)
  if (trimmed.includes(" ")) {
    const dp = getDefaultProvider();
    return {
      type: "search",
      provider: dp.name,
      query: trimmed,
      url: buildSearchUrl(dp, trimmed),
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
  const dp = getDefaultProvider();
  return {
    type: "search",
    provider: dp.name,
    query: trimmed,
    url: buildSearchUrl(dp, trimmed),
  };
}

/**
 * Legacy API — returns the resolved URL string.
 */
export function resolveInput(input: string): string {
  const result = resolveInputDetailed(input);
  if (result.type === "empty") return "";
  return result.url;
}

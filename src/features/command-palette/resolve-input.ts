// ── Bang providers ──────────────────────────────────────────────
const BANG_PROVIDERS: Record<string, string> = {
  "!g": "https://www.google.com/search?q=",
  "!d": "https://duckduckgo.com/?q=",
  "!gh": "https://github.com/search?q=",
  "!yt": "https://www.youtube.com/results?search_query=",
  "!w": "https://en.wikipedia.org/w/index.php?search=",
};

/**
 * Resolve a raw command-palette input string into a navigable URL.
 * Handles bang syntax, bare URLs, and search fallback.
 */
export function resolveInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Bang at start: !g query
  const bangStartMatch = trimmed.match(/^(![\w]+)\s+(.+)/);
  if (bangStartMatch?.[1] && bangStartMatch[2]) {
    const provider = BANG_PROVIDERS[bangStartMatch[1]];
    if (provider) return provider + encodeURIComponent(bangStartMatch[2]);
  }

  // Bang at end: query !g
  const bangEndMatch = trimmed.match(/^(.+)\s+(![\w]+)$/);
  if (bangEndMatch?.[1] && bangEndMatch[2]) {
    const provider = BANG_PROVIDERS[bangEndMatch[2]];
    if (provider) return provider + encodeURIComponent(bangEndMatch[1]);
  }

  // Has explicit protocol (http/https only)
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Looks like a URL (has dot, no spaces)
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }

  // Default: DuckDuckGo search
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

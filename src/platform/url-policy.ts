const WEB_SCHEMES = new Set(["http:", "https:", "about:", "data:"]);
const INTERNAL_SCHEMES = new Set([...WEB_SCHEMES, "file:", "chrome-extension:"]);

export function isAllowedUrl(url: string, source: "web" | "internal" = "web"): boolean {
  try {
    return (source === "internal" ? INTERNAL_SCHEMES : WEB_SCHEMES).has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Local documents may follow local links, including Windows/WSL UNC URLs. */
export function isAllowedNavigation(url: string, sourceUrl: string): boolean {
  if (isAllowedUrl(url)) return true;
  try {
    return new URL(url).protocol === "file:" && new URL(sourceUrl).protocol === "file:";
  } catch {
    return false;
  }
}

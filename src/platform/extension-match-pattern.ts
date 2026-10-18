/**
 * Match the HTTP(S) URL patterns supported by this browser's extension adapter.
 * `tabs.query` may also name extension pages (`chrome-extension://<id>/...`) explicitly;
 * host permissions cannot.
 */
export function matchesUrl(pattern: string, value: string, extensionPages = false): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const extensionPage = extensionPages && url.protocol === "chrome-extension:";
  if (!extensionPage && !["http:", "https:"].includes(url.protocol)) return false;
  if (pattern === "<all_urls>") return !extensionPage;
  const parts =
    /^(\*|https?|chrome-extension):\/\/(\*|\*\.[^/:]+|\[[\da-f:]+\]|[^/:]+)(?::(\d+|\*))?(\/.*)$/i.exec(
      pattern,
    );
  if (!parts) return false;
  const [, scheme, rawHost, port, pathname] = parts;
  if (!scheme || !rawHost || !pathname) return false;
  if (scheme === "*" ? extensionPage : `${scheme.toLowerCase()}:` !== url.protocol) return false;
  const host = rawHost.toLowerCase();
  if (
    host !== "*" &&
    host !== url.hostname &&
    !(
      host.startsWith("*.") &&
      (url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1)))
    )
  )
    return false;
  const actualPort = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port && port !== "*" && port !== actualPort) return false;
  const expression = pathname
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(url.pathname + url.search);
}

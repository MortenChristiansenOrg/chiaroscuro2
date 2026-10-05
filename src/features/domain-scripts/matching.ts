import { BUILT_IN_PAGES } from "../../shared/built-in-pages";
import type { DomainScript } from "./domain-scripts.shared";

export function normalizeDomain(domain: string): string {
  const candidate = domain.trim().toLowerCase();
  if (!candidate || /[\s/\\:@?#]/.test(candidate))
    throw new Error("Enter a hostname without a protocol, path, or port.");
  const parsed = new URL(`https://${candidate}`);
  if (!parsed.hostname || parsed.hostname !== candidate)
    throw new Error("Enter a valid domain hostname.");
  return parsed.hostname;
}

export function normalizeScript(script: DomainScript): DomainScript {
  const alias = script.alias.trim().toLowerCase();
  if (alias && !/^\/[a-z0-9][a-z0-9-]*$/.test(alias))
    throw new Error("Aliases must start with / and contain letters, numbers, or hyphens.");
  if (alias && BUILT_IN_PAGES.some((page) => page.route === alias))
    throw new Error(`Alias ${alias} is reserved for a browser page.`);
  if (!script.pathPattern.startsWith("/"))
    throw new Error("The URL path pattern must start with /.");
  return {
    ...script,
    domain: normalizeDomain(script.domain),
    name: script.name.trim(),
    alias,
    shortcut: script.shortcut.trim(),
  };
}

export function matchesScript(script: DomainScript, url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.hostname !== script.domain)
      return false;
    const expression = script.pathPattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${expression}$`).test(parsed.pathname);
  } catch {
    return false;
  }
}

import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import type { PageSnapshot } from "../domain-scripts/domain-scripts.main";
import { normalizeDomain } from "../domain-scripts/matching";

export interface AiPageDeps {
  platform: Platform;
  getActivePageTabId: () => TabId | undefined;
  getPageSnapshots: () => Map<TabId, PageSnapshot>;
}

export function selectAiPage(deps: AiPageDeps, domain: string) {
  const normalized = normalizeDomain(domain);
  const pages = [...deps.getPageSnapshots()].filter(([id, page]) => {
    try {
      const url = new URL(deps.platform.getTabUrl(id) ?? page.url);
      return (
        !page.builtIn &&
        !page.loading &&
        ["http:", "https:"].includes(url.protocol) &&
        url.hostname === normalized
      );
    } catch {
      return false;
    }
  });
  const selected = pages.find(([id]) => id === deps.getActivePageTabId()) ?? pages.at(-1);
  if (!selected) throw new Error(`Open a page on ${normalized} before asking AI.`);
  const [tabId, page] = selected;
  const url = deps.platform.getTabUrl(tabId) ?? page.url;
  const assertCurrent = () => {
    const snapshot = deps.getPageSnapshots().get(tabId);
    if (!snapshot || snapshot.loading || deps.platform.getTabUrl(tabId) !== url)
      throw new Error("The target page changed or closed. Open the page and try again.");
  };
  return { tabId, url, assertCurrent };
}

export async function inspectAiPage(platform: Platform, tabId: TabId): Promise<string> {
  // Only our fixed inspection script executes. Generated JavaScript never executes here.
  const result = await platform.executeJavaScript(
    tabId,
    `(() => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('script, style, input, textarea, [contenteditable], iframe').forEach(e => e.remove());
    return JSON.stringify({ title: document.title, url: location.href, viewport: { width: innerWidth, height: innerHeight }, html: root.outerHTML.slice(0, 60000) });
  })()`,
  );
  if (typeof result !== "string")
    throw new Error("Could not inspect the target page. Try again after it loads.");
  return result;
}
export function codeFromResponse(value: string): string {
  return value
    .trim()
    .replace(/^```(?:javascript|js|css)?\s*\n/i, "")
    .replace(/\n```\s*$/, "");
}

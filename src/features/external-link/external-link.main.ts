import { pathToFileURL } from "node:url";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import type { WindowId } from "../../shared/types";
import type { TabsCommands } from "../tabs/tabs.shared";
import {
  EXTERNAL_LINK_OPEN,
  EXTERNAL_LINK_RECEIVED,
  type ExternalLinkCommands,
  type ExternalLinkEvents,
} from "./external-link.shared";

// ── URL parsing (exported for testing) ───────────────────────────

const ALLOWED_SCHEMES = new Set(["http:", "https:", "file:"]);

/** Validate a URL string; returns normalized URL or null. */
export function validateUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return ALLOWED_SCHEMES.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Convert a local file path to a file:// URL string. */
export function filePathToUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

/** Extract valid URLs from an argv array. Skips binary/script args and flags. */
export function extractUrls(argv: readonly string[]): string[] {
  const urls: string[] = [];
  // argv[0] = electron binary, argv[1] = script path / "."
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("-")) continue;

    // Try as URL first
    const asUrl = validateUrl(arg);
    if (asUrl) {
      urls.push(asUrl);
      continue;
    }

    // Treat as file path
    const asFile = validateUrl(filePathToUrl(arg));
    if (asFile) urls.push(asFile);
  }
  return urls;
}

// ── Early setup (before app.whenReady) ───────────────────────────

/** Minimal app interface for dependency injection (avoids direct Electron import). */
export interface ElectronAppSubset {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", cb: (event: unknown, argv: string[]) => void): void;
  on(event: "open-url", cb: (event: { preventDefault(): void }, url: string) => void): void;
  on(event: "open-file", cb: (event: { preventDefault(): void }, path: string) => void): void;
}

let urlQueue: string[] = [];
let flushCallback: ((urls: string[]) => void) | undefined;

/**
 * Must be called before `app.whenReady()`.
 * Acquires single-instance lock, registers OS URL/file listeners, queues URLs.
 * Returns false if lock not acquired (caller should skip all further setup).
 */
export function setupExternalLink(
  app: ElectronAppSubset,
  initialArgv: readonly string[] = process.argv,
): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }

  app.on("second-instance", (_event, argv) => {
    const urls = extractUrls(argv);
    if (urls.length) {
      urlQueue.push(...urls);
      flushCallback?.(urls);
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    const validated = validateUrl(url);
    if (validated) {
      urlQueue.push(validated);
      flushCallback?.([validated]);
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    const fileUrl = filePathToUrl(filePath);
    urlQueue.push(fileUrl);
    flushCallback?.([fileUrl]);
  });

  // Parse initial argv for cold-start URLs
  const initial = extractUrls(initialArgv);
  urlQueue.push(...initial);

  return true;
}

// ── Feature (register + start) ───────────────────────────────────

type AllCommands = ExternalLinkCommands & Pick<TabsCommands, "tabs:create">;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<ExternalLinkEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
}

export default defineFeature<Deps>({
  register({ commands, events, platform, getActiveWindowId }) {
    commands.handle(EXTERNAL_LINK_OPEN, async ({ url }) => {
      const validated = validateUrl(url);
      if (!validated) return;
      await commands.send("tabs:create", { url: validated, activate: true });
      const wid = getActiveWindowId();
      if (wid) await platform.focusWindow(wid);
    });
  },

  start({ commands, events }) {
    flushCallback = (urls) => {
      if (!urls.length) return;
      events.emit(EXTERNAL_LINK_RECEIVED, { urls });
      for (const url of urls) {
        commands.send(EXTERNAL_LINK_OPEN, { url }).catch(logError("external-link", "open url"));
      }
    };

    // Drain URLs queued before renderer was ready
    if (urlQueue.length) {
      const queued = urlQueue.splice(0);
      flushCallback(queued);
    }
  },

  teardown() {
    urlQueue = [];
    flushCallback = undefined;
  },
});

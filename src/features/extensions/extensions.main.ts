import fs from "node:fs";
import path from "node:path";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { SingletonTab } from "../../shared/singleton-tab";
import { TABS_CLOSED, type TabsCommands, type TabsEvents } from "../tabs/tabs.shared";
import { ExtensionManager } from "./extension-manager";
import {
  EXTENSIONS_APPROVE,
  EXTENSIONS_CHANGED,
  EXTENSIONS_CHECK_UPDATES,
  EXTENSIONS_INSTALL,
  EXTENSIONS_OPEN,
  EXTENSIONS_OPEN_POPUP,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
  type ExtensionAction,
  type ExtensionsCommands,
  type ExtensionsEvents,
} from "./extensions.shared";

type AllCommands = ExtensionsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = ExtensionsEvents & Pick<TabsEvents, typeof TABS_CLOSED>;
interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
}
let manager: ExtensionManager;
/** Extract browser action info from a Chrome extension manifest. */
function extractAction(
  directory: string,
  manifest: Record<string, unknown>,
): ExtensionAction | undefined {
  // Manifest V3 uses "action", V2 uses "browser_action"
  const raw = (manifest.action ?? manifest.browser_action) as Record<string, unknown> | undefined;
  if (!raw) return undefined;

  const popup = typeof raw.default_popup === "string" ? raw.default_popup : "";
  const title = typeof raw.default_title === "string" ? raw.default_title : "";

  return { popup, title, iconUrl: readIcon(directory, raw.default_icon, 16) };
}

function readIcon(directory: string, icons: unknown, displaySize: number): string {
  let iconPath = "";
  if (typeof icons === "string") {
    iconPath = icons;
  } else if (icons && typeof icons === "object") {
    const sizes = Object.keys(icons)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const best = sizes.find((size) => size >= displaySize) ?? sizes.at(-1);
    const candidate =
      best === undefined ? undefined : (icons as Record<string, unknown>)[String(best)];
    if (typeof candidate === "string") iconPath = candidate;
  }

  // Toolbar images are not necessarily web-accessible extension resources.
  // Embed a bounded raster asset, keeping the extension's execution origin intact.
  let iconUrl = "";
  if (iconPath) {
    const file = path.resolve(directory, iconPath.replace(/^\//, ""));
    const relative = path.relative(directory, file);
    const imageTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const mime = imageTypes[path.extname(file).toLowerCase()];
    if (mime && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      try {
        const real = fs.realpathSync(file);
        const realRelative = path.relative(fs.realpathSync(directory), real);
        if (
          !realRelative.startsWith("..") &&
          !path.isAbsolute(realRelative) &&
          fs.statSync(real).size <= 256 * 1024
        ) {
          iconUrl = `data:${mime};base64,${fs.readFileSync(real).toString("base64")}`;
        }
      } catch {
        /* An absent icon does not prevent loading the extension. */
      }
    }
  }

  return iconUrl;
}

function emitChanged(events: EventBus<AllEvents>): void {
  events.emit(EXTENSIONS_CHANGED, {
    extensions: manager.records.map((record) => {
      const loaded = manager.loaded.get(record.id);
      const manifest = loaded?.manifest ?? manager.manifests.get(record.id);
      const directory = manager.directory(record.id);
      const action = manifest && extractAction(directory, manifest);
      const pending = record.pending;
      return {
        id: record.id,
        name: record.name,
        version: record.version,
        enabled: record.enabled,
        installed: record.installed !== false,
        loaded: !!loaded,
        busy: manager.busy.has(record.id),
        error: record.error,
        lastChecked: record.lastChecked,
        updateVersion: pending?.version,
        review:
          pending && !pending.approved
            ? {
                token: pending.hash,
                permissions: pending.permissions.filter(
                  (permission) => !record.permissions?.includes(permission),
                ),
              }
            : manager.reviews.get(record.id),
        restartRequired: !!pending?.approved,
        action: loaded ? action : undefined,
        iconUrl: manifest ? readIcon(directory, manifest.icons, 40) || action?.iconUrl || "" : "",
      };
    }),
  });
}
export default defineFeature<Deps>({
  register({ commands, events, platform, dataStore }) {
    manager?.stop();
    manager = new ExtensionManager(
      platform,
      dataStore,
      () => emitChanged(events),
      process.versions.chrome ?? "131.0",
    );
    const tab = new SingletonTab({
      activate: (tabId) => commands.send("tabs:activate", { tabId }),
      create: (url) => commands.send("tabs:create", { url }),
    });
    events.on(TABS_CLOSED, ({ tabId }) => tab.onClose(tabId));
    commands.handle(EXTENSIONS_OPEN, async () => {
      await tab.openOrActivate("/extensions");
    });
    commands.handle(EXTENSIONS_INSTALL, async ({ extensionId }) => manager.check(extensionId));
    commands.handle(EXTENSIONS_CHECK_UPDATES, async ({ extensionId }) =>
      manager.check(extensionId),
    );
    commands.handle(EXTENSIONS_APPROVE, async ({ extensionId, token }) =>
      manager.approve(extensionId, token),
    );
    commands.handle(EXTENSIONS_UNINSTALL, async ({ extensionId }) =>
      manager.uninstall(extensionId),
    );
    commands.handle(EXTENSIONS_SET_ENABLED, async ({ extensionId, enabled }) =>
      manager.setEnabled(extensionId, enabled),
    );
    commands.handle(EXTENSIONS_OPEN_POPUP, async ({ extensionId }) => {
      const extension = manager.loaded.get(extensionId);
      if (!extension)
        throw new Error("Extension is not running. Open Extensions to review its status.");
      const action = extractAction(extension.path, extension.manifest);
      if (action?.popup) platform.openExtensionPopup(extension.id, action.popup);
    });
  },
  async start() {
    await manager.start();
  },
  teardown() {
    manager.stop();
  },
});

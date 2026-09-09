import { mkdirSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { CommandBus } from "../bus/command-bus";
import { commandContracts } from "../bus/command-contracts";
import { EventBus } from "../bus/event-bus";
import { bridgeBusToIpc } from "../bus/ipc-main-bridge";
import type { CommandRegistry, EventRegistry, MergeRegistries } from "../bus/types";
import { createDataStore } from "../data/store";
import type { DataStore } from "../data/types";
import appState, {
  loadPersistedState,
  onWindowBoundsChanged,
} from "../features/app-state/app-state.main";
import type { AppStateCommands, AppStateEvents } from "../features/app-state/app-state.shared";
import commandPalette from "../features/command-palette/command-palette.main";
import type {
  CommandPaletteCommands,
  CommandPaletteEvents,
} from "../features/command-palette/command-palette.shared";
import contextMenu from "../features/context-menu/context-menu.main";
import type {
  ContextMenuCommands,
  ContextMenuEvents,
} from "../features/context-menu/context-menu.shared";
import debugServer, { getActualPort } from "../features/debug-server/debug-server.main";
import type {
  DebugServerCommands,
  DebugServerEvents,
} from "../features/debug-server/debug-server.shared";
import { registerDebugState } from "../features/debug-server/state-providers";
import devTools from "../features/dev-tools/dev-tools.main";
import type { DevToolsCommands, DevToolsEvents } from "../features/dev-tools/dev-tools.shared";
import domainCss from "../features/domain-css/domain-css.main";
import type { DomainCssCommands, DomainCssEvents } from "../features/domain-css/domain-css.shared";
import downloads from "../features/downloads/downloads.main";
import type { DownloadsCommands, DownloadsEvents } from "../features/downloads/downloads.shared";
import externalLink, { setupExternalLink } from "../features/external-link/external-link.main";
import type {
  ExternalLinkCommands,
  ExternalLinkEvents,
} from "../features/external-link/external-link.shared";
import findText from "../features/find-text/find-text.main";
import type { FindTextCommands, FindTextEvents } from "../features/find-text/find-text.shared";
import folders, {
  getFoldersForLevel,
  setFolderOrder,
  start as startFolders,
} from "../features/folders/folders.main";
import type { FoldersCommands, FoldersEvents } from "../features/folders/folders.shared";
import installer from "../features/installer/installer.main";
import type { InstallerCommands, InstallerEvents } from "../features/installer/installer.shared";
import localWebApp, {
  start as startLocalWebApp,
} from "../features/local-web-app/local-web-app.main";
import type {
  LocalWebAppCommands,
  LocalWebAppEvents,
} from "../features/local-web-app/local-web-app.shared";
import pdfReader, { getPdfSourceUrl } from "../features/pdf-reader/pdf-reader.main";
import type { PdfReaderCommands, PdfReaderEvents } from "../features/pdf-reader/pdf-reader.shared";
import permissions from "../features/permissions/permissions.main";
import type {
  PermissionsCommands,
  PermissionsEvents,
} from "../features/permissions/permissions.shared";
import pinnedTabs, {
  isPinned,
  start as startPinnedTabs,
} from "../features/pinned-tabs/pinned-tabs.main";
import type {
  PinnedTabsCommands,
  PinnedTabsEvents,
} from "../features/pinned-tabs/pinned-tabs.shared";
import pip from "../features/pip/pip.main";
import type { PipCommands, PipEvents } from "../features/pip/pip.shared";
import settings from "../features/settings/settings.main";
import {
  SETTINGS_GET,
  type SettingsCommands,
  type SettingsEvents,
} from "../features/settings/settings.shared";
import sidebar from "../features/sidebar/sidebar.main";
import type { SidebarCommands, SidebarEvents } from "../features/sidebar/sidebar.shared";
import subTabs, { getSubTabSnapshot } from "../features/sub-tabs/sub-tabs.main";
import type { SubTabsCommands, SubTabsEvents } from "../features/sub-tabs/sub-tabs.shared";
import tabContextMenu from "../features/tab-context-menu/tab-context-menu.main";
import type {
  TabContextMenuCommands,
  TabContextMenuEvents,
} from "../features/tab-context-menu/tab-context-menu.shared";
import tabCustomization, {
  getCustomization,
  start as startTabCustomization,
} from "../features/tab-customization/tab-customization.main";
import type {
  TabCustomizationCommands,
  TabCustomizationEvents,
} from "../features/tab-customization/tab-customization.shared";
import tabs, {
  getAllTabs,
  getTab,
  getTabsForWorkspace,
  setTabFolderId,
  setTabOrder,
  start as startTabs,
} from "../features/tabs/tabs.main";
import type { TabsCommands, TabsEvents } from "../features/tabs/tabs.shared";
import terminal from "../features/terminal/terminal.main";
import type { TerminalCommands, TerminalEvents } from "../features/terminal/terminal.shared";
import tooltip from "../features/tooltip/tooltip.main";
import type { TooltipCommands, TooltipEvents } from "../features/tooltip/tooltip.shared";
import windowChrome from "../features/window-chrome/window-chrome.main";
import type {
  WindowChromeCommands,
  WindowChromeEvents,
} from "../features/window-chrome/window-chrome.shared";
import workspaces, { isPrivacyWorkspace } from "../features/workspaces/workspaces.main";
import type {
  WorkspacesCommands,
  WorkspacesEvents,
} from "../features/workspaces/workspaces.shared";
import zoom from "../features/zoom/zoom.main";
import type { ZoomCommands, ZoomEvents } from "../features/zoom/zoom.shared";
import { ElectronPlatform } from "../platform/electron";
import { logError } from "../shared/log";
import type { TabId, WindowId, WorkspaceId } from "../shared/types";

// Log uncaught exceptions to stderr for debugging
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
const iconPath = path.join(__dirname, "../../resources", iconFile);

// ── Dev-mode isolation ───────────────────────────────────────────
// Use a separate app identity so dev instances don't conflict with
// the production single-instance lock or userData.
const isDev = !!process.env.ELECTRON_RENDERER_URL;
const isAutomation = process.env.NODE_ENV === "test" && process.env.CHIAROSCURO_AUTOMATION === "1";
// Isolate Chromium cookies, caches, sessions and the single-instance lock, not just our JSON data.
if (process.env.NODE_ENV === "test") {
  if (!process.env.DATA_DIR || !path.isAbsolute(process.env.DATA_DIR)) {
    throw new Error("Tests require an absolute DATA_DIR; use the Electron verification fixture.");
  }
  const chromiumProfile = path.join(process.env.DATA_DIR, "chromium");
  mkdirSync(chromiumProfile, { recursive: true });
  app.setPath("userData", chromiumProfile);
  const downloadsPath = path.join(process.env.DATA_DIR, "downloads");
  mkdirSync(downloadsPath, { recursive: true });
  app.setPath("desktop", downloadsPath);
  app.setPath("downloads", downloadsPath);
}
if (isDev) {
  app.setName("Chiaroscuro Dev");
}

// ── Single-instance lock (must run before whenReady) ─────────────
// Skip in test mode: parallel Playwright workers each launch their own
// Electron instance, and the OS-level lock would reject all but the first.
const gotLock = process.env.NODE_ENV === "test" || setupExternalLink(app);
if (!gotLock) {
  // Second instance — argv forwarded to running instance, quit immediately.
  // app.quit() already called inside setupExternalLink.
}

// ── Merged bus types ──────────────────────────────────────────────
type AllCommands = MergeRegistries<
  [
    AppStateCommands,
    WindowChromeCommands,
    TabsCommands,
    WorkspacesCommands,
    PinnedTabsCommands,
    SidebarCommands,
    CommandPaletteCommands,
    SettingsCommands,
    TooltipCommands,
    ContextMenuCommands,
    FoldersCommands,
    ZoomCommands,
    DevToolsCommands,
    DomainCssCommands,
    DownloadsCommands,
    FindTextCommands,
    TabCustomizationCommands,
    TerminalCommands,
    LocalWebAppCommands,
    InstallerCommands,
    SubTabsCommands,
    TabContextMenuCommands,
    DebugServerCommands,
    ExternalLinkCommands,
    PermissionsCommands,
    PdfReaderCommands,
    PipCommands,
  ]
>;

type AllEvents = MergeRegistries<
  [
    AppStateEvents,
    WindowChromeEvents,
    TabsEvents,
    WorkspacesEvents,
    PinnedTabsEvents,
    SidebarEvents,
    CommandPaletteEvents,
    SettingsEvents,
    TooltipEvents,
    ContextMenuEvents,
    FoldersEvents,
    ZoomEvents,
    DevToolsEvents,
    DomainCssEvents,
    DownloadsEvents,
    FindTextEvents,
    TabCustomizationEvents,
    TerminalEvents,
    LocalWebAppEvents,
    InstallerEvents,
    SubTabsEvents,
    TabContextMenuEvents,
    DebugServerEvents,
    ExternalLinkEvents,
    PermissionsEvents,
    PdfReaderEvents,
    PipEvents,
  ]
>;

const commands = new CommandBus<AllCommands>(commandContracts);
const events = new EventBus<AllEvents>();

// ── App state ───────────────────────────────────────────────────
let activeWindowId: WindowId | undefined;
let activeTabId: TabId | undefined;
let activeWorkspaceId: WorkspaceId | undefined;

if (isDev && process.env.NODE_ENV !== "test")
  app.setPath("userData", path.join(app.getPath("userData"), "..", "chiaroscuro-dev"));
const platform = new ElectronPlatform(() => activeWindowId);
const dataDir = process.env.DATA_DIR ?? path.join(app.getPath("userData"), "data");
const dataStore: DataStore = createDataStore(dataDir);

function initOverlays(): void {
  if (!activeWindowId) return;
  if (process.env.NODE_ENV !== "test" || isAutomation) {
    platform.initTooltipOverlay(activeWindowId);
  }
  platform.initCommandPaletteOverlay(activeWindowId);
}

function createWindow(windowBounds?: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BrowserWindow {
  const win = new BrowserWindow({
    ...(windowBounds ?? { width: 1200, height: 800 }),
    icon: iconPath,
    titleBarStyle: "hidden",
    backgroundMaterial: "acrylic",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  activeWindowId = String(win.id) as WindowId;

  // Hook BrowserWindow webContents for shortcut support
  platform.hookWebContents(win.webContents);

  // Sync maximize state from native events
  win.on("maximize", () => {
    if (!win.isDestroyed()) events.emit("window:maximized-changed", { maximized: true });
  });
  win.on("unmaximize", () => {
    if (!win.isDestroyed()) events.emit("window:maximized-changed", { maximized: false });
  });

  // Track window bounds for app-state persistence
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const trackBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      if (!win.isMaximized() && !win.isMinimized()) {
        onWindowBoundsChanged(win.getBounds());
      }
    }, 200);
  };
  win.on("move", trackBounds);
  win.on("resize", trackBounds);

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}

const deps = {
  commands,
  events,
  platform,
  dataStore,
  isDev,
  getActiveWindowId: () => activeWindowId,
  getActiveTabId: () => activeTabId,
  setActiveTabId: (id: TabId | undefined) => {
    activeTabId = id;
  },
  getActiveWorkspaceId: () => activeWorkspaceId,
  setActiveWorkspaceId: (id: WorkspaceId) => {
    activeWorkspaceId = id;
  },
};

if (gotLock) {
  app.on("render-process-gone", (_event, contents, details) => {
    logError("main", "renderer process exited")({ webContentsId: contents.id, ...details });
  });
  app.on("child-process-gone", (_event, details) => {
    logError("main", "child process exited")(details);
  });
  app.whenReady().then(async () => {
    await dataStore.initialize();

    // Phase 1: register all command handlers
    // Debug server first — recorder patches capture all subsequent registrations
    debugServer.register({
      ...deps,
      commandBus: commands as unknown as CommandBus<CommandRegistry>,
      eventBus: events as unknown as EventBus<EventRegistry>,
    });

    const getTabUrl = (tabId: TabId) => platform.getTabUrl(tabId) ?? getTab(tabId)?.url;

    appState.register(deps);
    windowChrome.register({
      ...deps,
      getTabUrl,
      handlePdfBack: (tabId) => {
        const sourceUrl = getPdfSourceUrl(tabId);
        if (!sourceUrl) return false;
        const tab = getTab(tabId);
        const workspaceId = tab?.workspaceId as WorkspaceId | undefined;
        commands
          .send("tabs:close", { tabId })
          .then(() =>
            commands.send("tabs:create", { url: sourceUrl, ...(workspaceId && { workspaceId }) }),
          )
          .catch(logError("main", "pdf back navigation"));
        return true;
      },
    });
    tabs.register({
      ...deps,
      isPinned,
      getCustomization,
      getFoldersForLevel,
      setFolderOrder,
      isPrivacyWorkspace,
    });
    workspaces.register({ ...deps, getTabsForWorkspace });
    pinnedTabs.register({ ...deps, getCustomization });
    sidebar.register(deps);
    commandPalette.register({ ...deps, isPrivacyWorkspace });
    settings.register(deps);
    tooltip.register(deps);
    contextMenu.register(deps);
    folders.register({ ...deps, getTab, getTabsForWorkspace, setTabFolderId, setTabOrder });
    zoom.register({
      ...deps,
      getActiveTabId: () => {
        const parentId = deps.getActiveTabId();
        return (
          getSubTabSnapshot()
            .filter((tab) => tab.parentTabId === parentId)
            .at(-1)?.id ?? parentId
        );
      },
    });
    devTools.register(deps);
    domainCss.register({ ...deps, dataDir, getTabsSnapshot: getAllTabs });
    downloads.register(deps);
    findText.register(deps);
    tabCustomization.register({ ...deps, getTab, isPinned });
    terminal.register(deps);
    localWebApp.register(deps);
    installer.register(deps);
    subTabs.register(deps);
    tabContextMenu.register(deps);
    externalLink.register(deps);
    permissions.register(deps);
    pdfReader.register(deps);
    pip.register(deps);

    // Register debug state providers
    registerDebugState("tabs", () => {
      const all: Record<string, unknown> = {};
      for (const [id, tab] of getAllTabs()) all[id] = tab;
      return { all, activeTabId };
    });
    registerDebugState("workspaces", () => ({ activeWorkspaceId }));
    registerDebugState("settings", () => commands.send(SETTINGS_GET, undefined).catch(() => null));
    registerDebugState("window", () => {
      const win =
        (activeWindowId ? BrowserWindow.fromId(Number(activeWindowId)) : null) ??
        BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.getParentWindow()) ??
        null;
      return {
        activeWindowId,
        bounds: win && !win.isDestroyed() ? win.getBounds() : null,
        maximized: win && !win.isDestroyed() ? win.isMaximized() : null,
      };
    });
    registerDebugState("debug-server", () => ({ actualPort: getActualPort() }));
    registerDebugState("sub-tabs", getSubTabSnapshot);
    registerDebugState("targets", () => {
      const targets = platform.getDebugTargets();
      const shell = targets.find((target) => target.windowId === Number(activeWindowId));
      if (shell) shell.kind = "shell";
      for (const target of targets) {
        const subTab = getSubTabSnapshot().find((tab) => tab.id === target.tabId);
        if (subTab) {
          target.kind = "sub-tab";
          target.parentId = `tab:${subTab.parentTabId}`;
        }
      }
      for (const [id, tab] of getAllTabs()) {
        if (tab.builtIn && shell)
          targets.push({
            ...shell,
            id: `tab:${id}`,
            kind: "built-in",
            tabId: id,
            parentId: shell.id,
            url: tab.url,
            title: tab.title,
            visible: activeTabId === id && shell.visible,
          });
      }
      return targets;
    });
    if (isAutomation) {
      Object.assign(globalThis, {
        __testHooks: { commandBus: commands, getDebugPort: getActualPort, ready: false },
      });
    }

    // Load persisted layout state before creating the window
    const getDisplayBounds = () => screen.getAllDisplays().map((d) => d.workArea);
    const appStateData = await loadPersistedState(dataStore, getDisplayBounds);

    // Bridge bus to IPC (once, before any window creation)
    bridgeBusToIpc(
      commands,
      events,
      () => BrowserWindow.getAllWindows(),
      (sender) => platform.isCommandSender(sender),
    );

    // Phase 2: wait for renderer subscriptions, then emit initial state.
    // Register BEFORE createWindow — the renderer sends "renderer:ready" at
    // module-import time, so registering after risks losing the signal.
    ipcMain.once("renderer:ready", async () => {
      appState.start?.(deps);
      await workspaces.start?.({ ...deps, getTabsForWorkspace });
      windowChrome.start?.({ ...deps, getTabUrl });
      await installer.start?.(deps);
      await startTabs({
        ...deps,
        isPinned,
        getCustomization,
        getFoldersForLevel,
        setFolderOrder,
        isPrivacyWorkspace,
      });
      await startPinnedTabs({ ...deps, getCustomization });
      sidebar.start?.(deps);
      await startFolders({ ...deps, getTab, getTabsForWorkspace, setTabFolderId, setTabOrder });
      await settings.start?.(deps);
      await domainCss.start?.({ ...deps, dataDir, getTabsSnapshot: getAllTabs });
      downloads.start?.(deps);
      await startTabCustomization({ ...deps, getTab, isPinned });
      terminal.start?.(deps);
      await startLocalWebApp(deps);
      await externalLink.start?.(deps);
      await permissions.start?.(deps);
      if (isAutomation)
        Object.assign((globalThis as unknown as { __testHooks: object }).__testHooks, {
          ready: true,
        });
    });

    const win = createWindow(appStateData.windowBounds);
    initOverlays();

    // Activate keyboard shortcuts immediately (window is focused on creation)
    // and toggle on focus/blur so they don't intercept keys from other apps.
    platform.activateShortcuts();

    app.on("browser-window-focus", () => platform.activateShortcuts());
    app.on("browser-window-blur", () => {
      // Small delay: focus may transfer between app windows (e.g. context menu)
      setTimeout(() => {
        if (!BrowserWindow.getFocusedWindow()) platform.deactivateShortcuts();
      }, 100);
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        initOverlays();
      }
    });
  });

  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    platform.deactivateShortcuts();
    debugServer.teardown?.();
    localWebApp.teardown?.();
    installer.teardown?.();
    externalLink.teardown?.();
    // Skip expensive persistence in test mode — speeds up Playwright teardown
    if (process.env.NODE_ENV === "test" && !isAutomation) return;
    event.preventDefault();
    quitting = true;
    // Flush app-state immediately before data store teardown
    commands
      .send("app-state:save", undefined)
      .catch(logError("main", "flush app-state"))
      .then(() => dataStore.destroy())
      .catch(logError("main", "destroy datastore"))
      .finally(() => app.quit());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

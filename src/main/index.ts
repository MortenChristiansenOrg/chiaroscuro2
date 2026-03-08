import path from "node:path";
import { BrowserWindow, Menu, app, ipcMain, screen } from "electron";
import { CommandBus } from "../bus/command-bus";
import { EventBus } from "../bus/event-bus";
import { bridgeBusToIpc } from "../bus/ipc-main-bridge";
import type { CommandRegistry, EventRegistry, MergeRegistries } from "../bus/types";
import { createDataStore } from "../data/store";
import type { DataStore } from "../data/types";
import appState from "../features/app-state/app-state.main";
import { loadPersistedState, onWindowBoundsChanged } from "../features/app-state/app-state.main";
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
import debugServer from "../features/debug-server/debug-server.main";
import { getActualPort } from "../features/debug-server/debug-server.main";
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
import findText from "../features/find-text/find-text.main";
import type { FindTextCommands, FindTextEvents } from "../features/find-text/find-text.shared";
import folders from "../features/folders/folders.main";
import {
  getFoldersForLevel,
  setFolderOrder,
  start as startFolders,
} from "../features/folders/folders.main";
import type { FoldersCommands, FoldersEvents } from "../features/folders/folders.shared";
import installer from "../features/installer/installer.main";
import type { InstallerCommands, InstallerEvents } from "../features/installer/installer.shared";
import localWebApp from "../features/local-web-app/local-web-app.main";
import { start as startLocalWebApp } from "../features/local-web-app/local-web-app.main";
import type {
  LocalWebAppCommands,
  LocalWebAppEvents,
} from "../features/local-web-app/local-web-app.shared";
import pinnedTabs from "../features/pinned-tabs/pinned-tabs.main";
import { isPinned, start as startPinnedTabs } from "../features/pinned-tabs/pinned-tabs.main";
import type {
  PinnedTabsCommands,
  PinnedTabsEvents,
} from "../features/pinned-tabs/pinned-tabs.shared";
import settings from "../features/settings/settings.main";
import type { SettingsCommands, SettingsEvents } from "../features/settings/settings.shared";
import sidebar from "../features/sidebar/sidebar.main";
import type { SidebarCommands, SidebarEvents } from "../features/sidebar/sidebar.shared";
import tabCustomization from "../features/tab-customization/tab-customization.main";
import {
  getCustomization,
  start as startTabCustomization,
} from "../features/tab-customization/tab-customization.main";
import type {
  TabCustomizationCommands,
  TabCustomizationEvents,
} from "../features/tab-customization/tab-customization.shared";
import tabs from "../features/tabs/tabs.main";
import {
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
import workspaces from "../features/workspaces/workspaces.main";
import { start as startWorkspaces } from "../features/workspaces/workspaces.main";
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
    DebugServerCommands,
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
    DebugServerEvents,
  ]
>;

const commands = new CommandBus<AllCommands>();
const events = new EventBus<AllEvents>();

// ── App state ───────────────────────────────────────────────────
let activeWindowId: WindowId | undefined;
let activeTabId: TabId | undefined;
let activeWorkspaceId: WorkspaceId | undefined;

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const platform = new ElectronPlatform(() => activeWindowId);
const dataDir = process.env.DATA_DIR ?? path.join(app.getPath("userData"), "data");
const dataStore: DataStore = createDataStore(dataDir);

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

app.whenReady().then(async () => {
  await dataStore.initialize();

  // Phase 1: register all command handlers
  // Debug server first — recorder patches capture all subsequent registrations
  debugServer.register({
    ...deps,
    commandBus: commands as unknown as CommandBus<CommandRegistry>,
    eventBus: events as unknown as EventBus<EventRegistry>,
  });

  appState.register(deps);
  windowChrome.register(deps);
  tabs.register({ ...deps, isPinned, getCustomization, getFoldersForLevel, setFolderOrder });
  workspaces.register({ ...deps, getTabsForWorkspace });
  pinnedTabs.register({ ...deps, getCustomization });
  sidebar.register(deps);
  commandPalette.register(deps);
  settings.register(deps);
  tooltip.register(deps);
  contextMenu.register(deps);
  folders.register({ ...deps, getTab, getTabsForWorkspace, setTabFolderId, setTabOrder });
  zoom.register(deps);
  devTools.register(deps);
  domainCss.register({ ...deps, dataDir, getTabsSnapshot: getAllTabs });
  downloads.register(deps);
  findText.register(deps);
  tabCustomization.register({ ...deps, getTab, isPinned });
  terminal.register(deps);
  localWebApp.register(deps);
  installer.register(deps);

  // Register debug state providers
  registerDebugState("tabs", () => {
    const all: Record<string, unknown> = {};
    for (const [id, tab] of getAllTabs()) all[id] = tab;
    return { all, activeTabId };
  });
  registerDebugState("workspaces", () => ({ activeWorkspaceId }));
  registerDebugState("settings", () =>
    commands
      .send("settings:get" as string & keyof AllCommands, undefined as never)
      .catch(() => null),
  );
  registerDebugState("window", () => {
    const win = BrowserWindow.getAllWindows()[0];
    return {
      activeWindowId,
      bounds: win && !win.isDestroyed() ? win.getBounds() : null,
      maximized: win && !win.isDestroyed() ? win.isMaximized() : null,
    };
  });
  registerDebugState("debug-server", () => ({ actualPort: getActualPort() }));

  // Load persisted layout state before creating the window
  const getDisplayBounds = () => screen.getAllDisplays().map((d) => d.workArea);
  const appStateData = await loadPersistedState(dataStore, getDisplayBounds);

  // Bridge bus to IPC (once, before any window creation)
  bridgeBusToIpc(commands, events, () => BrowserWindow.getAllWindows());

  // Phase 2: wait for renderer subscriptions, then emit initial state.
  // Register BEFORE createWindow — the renderer sends "renderer:ready" at
  // module-import time, so registering after risks losing the signal.
  ipcMain.once("renderer:ready", async () => {
    appState.start?.(deps);
    await startWorkspaces({ ...deps, getTabsForWorkspace });
    windowChrome.start?.(deps);
    await installer.start?.(deps);
    await startTabs({ ...deps, isPinned, getCustomization, getFoldersForLevel, setFolderOrder });
    await startPinnedTabs({ ...deps, getCustomization });
    sidebar.start?.(deps);
    await startFolders({ ...deps, getTab, getTabsForWorkspace, setTabFolderId, setTabOrder });
    await settings.start?.(deps);
    await domainCss.start?.({ ...deps, dataDir, getTabsSnapshot: getAllTabs });
    downloads.start?.(deps);
    await startTabCustomization({ ...deps, getTab, isPinned });
    terminal.start?.(deps);
    await startLocalWebApp(deps);
  });

  const win = createWindow(appStateData.windowBounds);

  if (activeWindowId && process.env.NODE_ENV !== "test") {
    platform.initTooltipOverlay(activeWindowId);
    platform.initContextMenuOverlay(activeWindowId);
  }

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
    }
  });
});

app.on("before-quit", () => {
  platform.deactivateShortcuts();
  debugServer.teardown?.();
  localWebApp.teardown?.();
  installer.teardown?.();
  // Flush app-state immediately before data store teardown
  commands.send("app-state:save", undefined).catch(logError("main", "flush app-state"));
  dataStore.destroy().catch(logError("main", "destroy datastore"));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

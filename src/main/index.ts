import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, ipcMain, screen } from "electron";
import { CommandBus } from "../bus/command-bus";
import { EventBus } from "../bus/event-bus";
import { bridgeBusToIpc } from "../bus/ipc-main-bridge";
import type { MergeRegistries } from "../bus/types";
import { createDataStore } from "../data/store";
import type { DataStore } from "../data/types";
import {
  loadPersistedState,
  onWindowBoundsChanged,
  register as registerAppState,
  start as startAppState,
} from "../features/app-state/app-state.main";
import type { AppStateCommands, AppStateEvents } from "../features/app-state/app-state.shared";
import {
  register as registerCommandPalette,
  start as startCommandPalette,
} from "../features/command-palette/command-palette.main";
import type {
  CommandPaletteCommands,
  CommandPaletteEvents,
} from "../features/command-palette/command-palette.shared";
import { register as registerContextMenu } from "../features/context-menu/context-menu.main";
import type {
  ContextMenuCommands,
  ContextMenuEvents,
} from "../features/context-menu/context-menu.shared";
import { register as registerDevTools } from "../features/dev-tools/dev-tools.main";
import type { DevToolsCommands, DevToolsEvents } from "../features/dev-tools/dev-tools.shared";
import {
  register as registerDomainCss,
  start as startDomainCss,
} from "../features/domain-css/domain-css.main";
import type { DomainCssCommands, DomainCssEvents } from "../features/domain-css/domain-css.shared";
import { register as registerDragDrop } from "../features/drag-drop/drag-drop.main";
import {
  DRAG_DROP_OPEN_FILES,
  type DragDropCommands,
  type DragDropEvents,
} from "../features/drag-drop/drag-drop.shared";
import {
  register as registerFolders,
  start as startFolders,
} from "../features/folders/folders.main";
import type { FoldersCommands, FoldersEvents } from "../features/folders/folders.shared";
import {
  register as registerPinnedTabs,
  start as startPinnedTabs,
} from "../features/pinned-tabs/pinned-tabs.main";
import type {
  PinnedTabsCommands,
  PinnedTabsEvents,
} from "../features/pinned-tabs/pinned-tabs.shared";
import {
  register as registerSettings,
  start as startSettings,
} from "../features/settings/settings.main";
import type { SettingsCommands, SettingsEvents } from "../features/settings/settings.shared";
import {
  register as registerSidebar,
  start as startSidebar,
} from "../features/sidebar/sidebar.main";
import type { SidebarCommands, SidebarEvents } from "../features/sidebar/sidebar.shared";
import { register as registerTabs, start as startTabs } from "../features/tabs/tabs.main";
import { getAllTabs } from "../features/tabs/tabs.main";
import type { TabsCommands, TabsEvents } from "../features/tabs/tabs.shared";
import { register as registerTooltip } from "../features/tooltip/tooltip.main";
import type { TooltipCommands, TooltipEvents } from "../features/tooltip/tooltip.shared";
import {
  register as registerWindowChrome,
  start as startWindowChrome,
} from "../features/window-chrome/window-chrome.main";
import type {
  WindowChromeCommands,
  WindowChromeEvents,
} from "../features/window-chrome/window-chrome.shared";
import {
  register as registerWorkspaces,
  start as startWorkspaces,
} from "../features/workspaces/workspaces.main";
import type {
  WorkspacesCommands,
  WorkspacesEvents,
} from "../features/workspaces/workspaces.shared";
import { register as registerZoom } from "../features/zoom/zoom.main";
import type { ZoomCommands, ZoomEvents } from "../features/zoom/zoom.shared";
import { ElectronPlatform } from "../platform/electron";
import type { TabId, WindowId, WorkspaceId } from "../shared/types";

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
    DragDropCommands,
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
    DragDropEvents,
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
}): void {
  const win = new BrowserWindow({
    ...(windowBounds ?? { width: 1200, height: 800 }),
    icon: iconPath,
    titleBarStyle: "hidden",
    backgroundMaterial: "acrylic",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      navigateOnDragDrop: true,
    },
  });

  activeWindowId = String(win.id) as WindowId;

  // Hook BrowserWindow webContents for shortcut support
  platform.hookWebContents(win.webContents);

  // Sync maximize state from native events
  win.on("maximize", () => {
    events.emit("window:maximized-changed", { maximized: true });
  });
  win.on("unmaximize", () => {
    events.emit("window:maximized-changed", { maximized: false });
  });

  // Track window bounds for app-state persistence
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const trackBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win.isMaximized() && !win.isMinimized()) {
        onWindowBoundsChanged(win.getBounds(), dataStore);
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
  registerAppState(deps);
  registerWindowChrome(deps);
  registerTabs(deps);
  registerWorkspaces(deps);
  registerPinnedTabs(deps);
  registerSidebar(deps);
  registerCommandPalette(deps);
  registerSettings(deps);
  registerTooltip(deps);
  registerContextMenu(deps);
  registerFolders(deps);
  registerZoom(deps);
  registerDevTools(deps);
  registerDomainCss({
    ...deps,
    dataDir,
    getTabsSnapshot: getAllTabs,
  });
  registerDragDrop(deps);

  // Load persisted layout state before creating the window
  const getDisplayBounds = () => screen.getAllDisplays().map((d) => d.workArea);
  const appState = await loadPersistedState(dataStore, getDisplayBounds);

  // Bridge bus to IPC (once, before any window creation)
  bridgeBusToIpc(commands, events, () => BrowserWindow.getAllWindows());

  // Intercept file:// navigations (triggered by OS file drops) on all webContents.
  // When a file is dropped and the page doesn't handle it, the browser tries to
  // navigate to file:///path — we prevent that and open the file as a new tab.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (url.startsWith("file:///")) {
        event.preventDefault();
        const filePath = fileURLToPath(url);
        commands.send(DRAG_DROP_OPEN_FILES, { filePaths: [filePath] }).catch(console.error);
      }
    });
  });

  createWindow(appState.windowBounds);
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

  // Phase 2: wait for renderer subscriptions, then emit initial state
  ipcMain.once("renderer:ready", async () => {
    startAppState(deps);
    await startWorkspaces(deps);
    startWindowChrome(deps);
    const restoredTabs = await startTabs(deps);
    await startPinnedTabs(deps, restoredTabs);
    startSidebar(deps);
    await startFolders(deps);
    await startCommandPalette(deps);
    await startSettings(deps);
    await startDomainCss({
      ...deps,
      dataDir,
      getTabsSnapshot: getAllTabs,
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  platform.deactivateShortcuts();
  // Flush app-state immediately before data store teardown
  commands.send("app-state:save", undefined).catch(console.error);
  dataStore.destroy().catch(console.error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

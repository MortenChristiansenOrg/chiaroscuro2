import path from "node:path";
import { BrowserWindow, Menu, app, ipcMain } from "electron";
import { CommandBus } from "../bus/command-bus";
import { EventBus } from "../bus/event-bus";
import { bridgeBusToIpc } from "../bus/ipc-main-bridge";
import type { MergeRegistries } from "../bus/types";
import { createDataStore } from "../data/store";
import type { DataStore } from "../data/types";
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
  register as registerSidebar,
  start as startSidebar,
} from "../features/sidebar/sidebar.main";
import type { SidebarCommands, SidebarEvents } from "../features/sidebar/sidebar.shared";
import { register as registerTabs, start as startTabs } from "../features/tabs/tabs.main";
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
import { getAllWorkspaces } from "../features/workspaces/workspaces.main";
import type {
  WorkspacesCommands,
  WorkspacesEvents,
} from "../features/workspaces/workspaces.shared";
import { ElectronPlatform } from "../platform/electron";
import type { TabId, WindowId, WorkspaceId } from "../shared/types";

Menu.setApplicationMenu(null);

const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
const iconPath = path.join(__dirname, "../../resources", iconFile);

// ── Merged bus types ──────────────────────────────────────────────
type AllCommands = MergeRegistries<
  [
    WindowChromeCommands,
    TabsCommands,
    WorkspacesCommands,
    PinnedTabsCommands,
    SidebarCommands,
    CommandPaletteCommands,
    TooltipCommands,
    ContextMenuCommands,
    FoldersCommands,
  ]
>;

type AllEvents = MergeRegistries<
  [
    WindowChromeEvents,
    TabsEvents,
    WorkspacesEvents,
    PinnedTabsEvents,
    SidebarEvents,
    CommandPaletteEvents,
    TooltipEvents,
    ContextMenuEvents,
    FoldersEvents,
  ]
>;

const commands = new CommandBus<AllCommands>();
const events = new EventBus<AllEvents>();

// ── App state ───────────────────────────────────────────────────
let activeWindowId: WindowId | undefined;
let activeTabId: TabId | undefined;
let activeWorkspaceId: WorkspaceId | undefined;

const platform = new ElectronPlatform(() => activeWindowId);
const dataDir = process.env.DATA_DIR ?? path.join(app.getPath("userData"), "data");
const dataStore: DataStore = createDataStore(dataDir);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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
    events.emit("window:maximized-changed", { maximized: true });
  });
  win.on("unmaximize", () => {
    events.emit("window:maximized-changed", { maximized: false });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
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
  registerWindowChrome(deps);
  registerTabs(deps);
  registerWorkspaces(deps);
  registerPinnedTabs(deps);
  registerSidebar(deps);
  registerCommandPalette(deps);
  registerTooltip(deps);
  registerContextMenu(deps);
  registerFolders(deps);

  // ── Global keyboard shortcuts ──────────────────────────────────
  // Ctrl+W: Close current tab
  platform.registerShortcut("CommandOrControl+W", () => {
    const tabId = deps.getActiveTabId();
    if (tabId) commands.send("tabs:close", { tabId }).catch(console.error);
  });

  // Ctrl+1..9: Switch to workspace N
  for (let n = 1; n <= 9; n++) {
    platform.registerShortcut(`CommandOrControl+${n}`, () => {
      const all = getAllWorkspaces();
      const ws = all[n - 1];
      if (ws) commands.send("workspaces:switch", { workspaceId: ws.id }).catch(console.error);
    });
  }

  // Ctrl+Shift+1..9: Move current tab to workspace N
  for (let n = 1; n <= 9; n++) {
    platform.registerShortcut(`CommandOrControl+Shift+${n}`, () => {
      const all = getAllWorkspaces();
      const ws = all[n - 1];
      if (ws)
        commands.send("workspaces:move-tab", { targetWorkspaceId: ws.id }).catch(console.error);
    });
  }

  // Bridge bus to IPC (once, before any window creation)
  bridgeBusToIpc(commands, events, () => BrowserWindow.getAllWindows());

  createWindow();
  if (activeWindowId && process.env.NODE_ENV !== "test") {
    platform.initTooltipOverlay(activeWindowId);
    platform.initContextMenuOverlay(activeWindowId);
  }

  // Phase 2: wait for renderer subscriptions, then emit initial state
  ipcMain.once("renderer:ready", async () => {
    await startWorkspaces(deps);
    startWindowChrome(deps);
    const restoredTabs = await startTabs(deps);
    await startPinnedTabs(deps, restoredTabs);
    startSidebar(deps);
    await startFolders(deps);
    await startCommandPalette(deps);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  dataStore.destroy().catch(console.error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

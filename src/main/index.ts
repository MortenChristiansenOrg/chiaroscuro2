import path from "node:path";
import { BrowserWindow, Menu, app } from "electron";
import { CommandBus } from "../bus/command-bus";
import { EventBus } from "../bus/event-bus";
import { bridgeBusToIpc } from "../bus/ipc-main-bridge";
import {
  register as registerWindowChrome,
  start as startWindowChrome,
} from "../features/window-chrome/window-chrome.main";
import type {
  WindowChromeCommands,
  WindowChromeEvents,
} from "../features/window-chrome/window-chrome.shared";
import { ElectronPlatform } from "../platform/electron";
import type { TabId, WindowId } from "../shared/types";

Menu.setApplicationMenu(null);

const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
const iconPath = path.join(__dirname, "../../resources", iconFile);

// ── Bus instances ────────────────────────────────────────────────
const commands = new CommandBus<WindowChromeCommands>();
const events = new EventBus<WindowChromeEvents>();

// ── App state (temporary until window/tabs features own this) ───
let activeWindowId: WindowId | undefined;
let activeTabId: TabId | undefined;

const platform = new ElectronPlatform(() => activeWindowId);

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

  // Track as active window (temporary — a window manager feature would own this)
  activeWindowId = String(win.id) as WindowId;

  // Bridge bus ↔ IPC
  bridgeBusToIpc(commands, events, () => BrowserWindow.getAllWindows());

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
  getActiveWindowId: () => activeWindowId,
  getActiveTabId: () => activeTabId,
};

app.whenReady().then(() => {
  registerWindowChrome(deps);
  createWindow();
  startWindowChrome(deps);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

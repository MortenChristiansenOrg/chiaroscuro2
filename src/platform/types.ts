import type { Bounds, TabId, WindowId } from "../shared/types";

export type { Bounds };

/** Abstraction over a single file download in progress. */
export interface PlatformDownload {
  filename: string;
  url: string;
  totalBytes: number;
  setSavePath(path: string): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  getReceivedBytes(): number;
  // biome-ignore lint/suspicious/noExplicitAny: thin wrapper over Electron DownloadItem events
  on(event: string, cb: (...args: any[]) => void): void;
  // biome-ignore lint/suspicious/noExplicitAny: thin wrapper over Electron DownloadItem events
  removeListener(event: string, cb: (...args: any[]) => void): void;
}

export interface Platform {
  // Window management
  createWindow(): Promise<WindowId>;
  closeWindow(windowId: WindowId): Promise<void>;
  minimizeWindow(windowId: WindowId): Promise<void>;
  maximizeWindow(windowId: WindowId): Promise<void>;
  unmaximizeWindow(windowId: WindowId): Promise<void>;
  isWindowMaximized(windowId: WindowId): boolean;
  focusWindow(windowId: WindowId): Promise<void>;
  getWindowBounds(windowId: WindowId): Bounds | undefined;
  setWindowBounds(windowId: WindowId, bounds: Bounds): void;

  // Tab/WebContentsView management
  createTab(windowId: WindowId, url: string): Promise<TabId>;
  closeTab(tabId: TabId): Promise<void>;
  navigateTab(tabId: TabId, url: string): Promise<void>;
  getTabUrl(tabId: TabId): string | undefined;
  getTabTitle(tabId: TabId): string | undefined;
  setTabBounds(tabId: TabId, bounds: Bounds): void;
  setTabBorderRadius(tabId: TabId, radius: number): void;
  hideTab(tabId: TabId): void;
  hideAllTabs(): void;
  onTabEvent(tabId: TabId, event: string, callback: (...args: unknown[]) => void): () => void;

  // Tab navigation
  goBack(tabId: TabId): void;
  goForward(tabId: TabId): void;
  reload(tabId: TabId): void;
  canGoBack(tabId: TabId): boolean;
  canGoForward(tabId: TabId): boolean;

  // Zoom
  setTabZoomLevel(tabId: TabId, level: number): void;
  getTabZoomLevel(tabId: TabId): number;

  // DevTools
  openTabDevTools(tabId: TabId, mode?: "right" | "bottom" | "undocked" | "detach"): void;
  closeTabDevTools(tabId: TabId): void;
  isTabDevToolsOpened(tabId: TabId): boolean;
  toggleShellDevTools(windowId: WindowId): void;

  // Keyboard shortcuts
  registerShortcut(accelerator: string, callback: () => void): void;
  unregisterShortcut(accelerator: string): void;
  /** Register a window-scoped shortcut via before-input-event (for keys like F12 that can't be global). */
  registerLocalShortcut(accelerator: string, callback: () => void): void;
  hookWebContents(webContents: unknown): void;

  // Focus
  focusShell(windowId: WindowId): void;

  // Tooltip overlay
  initTooltipOverlay(windowId: WindowId): void;
  showTooltip(opts: { text: string; x: number; y: number; width: number; height: number }): void;
  hideTooltip(): void;

  // Context menu overlay
  initContextMenuOverlay(windowId: WindowId): void;
  showContextMenu(opts: {
    items: { label: string; icon?: string; disabled?: boolean }[];
    x: number;
    y: number;
  }): Promise<number>;
  hideContextMenu(): void;

  // CSS injection
  insertCSS(tabId: TabId, css: string): Promise<string>;
  removeInsertedCSS(tabId: TabId, key: string): Promise<void>;

  // Downloads
  onDownload(callback: (download: PlatformDownload) => void): () => void;
  getDesktopPath(): string;

  // Dialogs
  showOpenDialog(options: { title?: string; properties?: string[] }): Promise<string[]>;

  // Shell / clipboard
  openExternal(url: string): Promise<void>;
  openPath(filePath: string): Promise<void>;
  readClipboard(): string;
  writeClipboard(text: string): void;
}

import type { Bounds, TabId, WindowId } from "../shared/types";

export type { Bounds };

export interface Platform {
  // Window management
  createWindow(): Promise<WindowId>;
  closeWindow(windowId: WindowId): Promise<void>;
  minimizeWindow(windowId: WindowId): Promise<void>;
  maximizeWindow(windowId: WindowId): Promise<void>;
  unmaximizeWindow(windowId: WindowId): Promise<void>;
  isWindowMaximized(windowId: WindowId): boolean;
  focusWindow(windowId: WindowId): Promise<void>;

  // Tab/WebContentsView management
  createTab(windowId: WindowId, url: string): Promise<TabId>;
  closeTab(tabId: TabId): Promise<void>;
  activateTab(windowId: WindowId, tabId: TabId): Promise<void>;
  navigateTab(tabId: TabId, url: string): Promise<void>;
  getTabUrl(tabId: TabId): string | undefined;
  getTabTitle(tabId: TabId): string | undefined;
  getTabFavicon(tabId: TabId): string | undefined;
  setTabBounds(tabId: TabId, bounds: Bounds): void;
  hideTab(tabId: TabId): void;
  showTab(tabId: TabId): void;
  hideAllTabs(): void;
  onTabEvent(tabId: TabId, event: string, callback: (...args: unknown[]) => void): () => void;

  // Tab navigation
  goBack(tabId: TabId): void;
  goForward(tabId: TabId): void;
  reload(tabId: TabId): void;
  canGoBack(tabId: TabId): boolean;
  canGoForward(tabId: TabId): boolean;

  // Session isolation
  createIsolatedSession(tabId: TabId): Promise<void>;

  // Keyboard shortcuts
  registerShortcut(accelerator: string, callback: () => void): void;
  unregisterShortcut(accelerator: string): void;
  hookWebContents(webContents: unknown): void;

  // Shell / clipboard
  openExternal(url: string): Promise<void>;
  readClipboard(): string;
  writeClipboard(text: string): void;
}

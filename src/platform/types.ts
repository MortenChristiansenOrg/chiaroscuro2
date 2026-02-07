import type { TabId, WindowId } from "../shared/types";

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

  // Session isolation
  createIsolatedSession(tabId: TabId): Promise<void>;

  // Keyboard shortcuts
  registerShortcut(accelerator: string, callback: () => void): void;
  unregisterShortcut(accelerator: string): void;

  // Shell / clipboard
  openExternal(url: string): Promise<void>;
  readClipboard(): string;
  writeClipboard(text: string): void;
}

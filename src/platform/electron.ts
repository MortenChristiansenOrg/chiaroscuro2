import { BrowserWindow, clipboard, globalShortcut, shell } from "electron";
import type { TabId, WindowId } from "../shared/types";
import type { Platform } from "./types";

/**
 * Electron implementation of the Platform interface.
 * Methods that require the Tabs feature throw until that feature is implemented.
 */
export class ElectronPlatform implements Platform {
  constructor(private getActiveWindowId: () => WindowId | undefined) {}

  private getWin(windowId?: WindowId): BrowserWindow | undefined {
    const id = windowId ?? this.getActiveWindowId();
    if (!id) return undefined;
    return BrowserWindow.fromId(Number(id)) ?? undefined;
  }

  // ── Window management ───────────────────────────────────────────

  async createWindow(): Promise<WindowId> {
    // TODO: implement when multi-window feature lands
    throw new Error("Not implemented: createWindow");
  }

  async closeWindow(windowId: WindowId): Promise<void> {
    this.getWin(windowId)?.close();
  }

  async minimizeWindow(windowId: WindowId): Promise<void> {
    this.getWin(windowId)?.minimize();
  }

  async maximizeWindow(windowId: WindowId): Promise<void> {
    this.getWin(windowId)?.maximize();
  }

  async unmaximizeWindow(windowId: WindowId): Promise<void> {
    this.getWin(windowId)?.unmaximize();
  }

  isWindowMaximized(windowId: WindowId): boolean {
    return this.getWin(windowId)?.isMaximized() ?? false;
  }

  async focusWindow(windowId: WindowId): Promise<void> {
    this.getWin(windowId)?.focus();
  }

  // ── Tab/WebContentsView management ──────────────────────────────

  async createTab(_windowId: WindowId, _url: string): Promise<TabId> {
    // TODO: implement when Tabs feature lands
    throw new Error("Not implemented: createTab");
  }

  async closeTab(_tabId: TabId): Promise<void> {
    throw new Error("Not implemented: closeTab");
  }

  async activateTab(_windowId: WindowId, _tabId: TabId): Promise<void> {
    throw new Error("Not implemented: activateTab");
  }

  async navigateTab(_tabId: TabId, _url: string): Promise<void> {
    throw new Error("Not implemented: navigateTab");
  }

  getTabUrl(_tabId: TabId): string | undefined {
    return undefined; // No tabs yet
  }

  // ── Session isolation ───────────────────────────────────────────

  async createIsolatedSession(_tabId: TabId): Promise<void> {
    throw new Error("Not implemented: createIsolatedSession");
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────

  registerShortcut(accelerator: string, callback: () => void): void {
    globalShortcut.register(accelerator, callback);
  }

  unregisterShortcut(accelerator: string): void {
    globalShortcut.unregister(accelerator);
  }

  // ── Shell / clipboard ───────────────────────────────────────────

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  readClipboard(): string {
    return clipboard.readText();
  }

  writeClipboard(text: string): void {
    clipboard.writeText(text);
  }
}

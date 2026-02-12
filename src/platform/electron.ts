import { BrowserWindow, WebContentsView, clipboard, shell } from "electron";
import type { TabId, WindowId } from "../shared/types";
import type { Bounds } from "../shared/types";
import type { Platform } from "./types";

interface ParsedAccelerator {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function parseAccelerator(accelerator: string): ParsedAccelerator {
  const parts = accelerator.toLowerCase().split("+");
  const result: ParsedAccelerator = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const part of parts) {
    switch (part) {
      case "commandorcontrol":
      case "cmdorctrl":
      case "control":
      case "ctrl":
        result.ctrl = true;
        break;
      case "shift":
        result.shift = true;
        break;
      case "alt":
        result.alt = true;
        break;
      case "meta":
      case "command":
      case "cmd":
      case "super":
        result.meta = true;
        break;
      default:
        result.key = part;
    }
  }
  return result;
}

function matchesInput(parsed: ParsedAccelerator, input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  const key = input.key.toLowerCase();
  return (
    key === parsed.key &&
    input.control === parsed.ctrl &&
    input.shift === parsed.shift &&
    input.alt === parsed.alt &&
    input.meta === parsed.meta
  );
}

export class ElectronPlatform implements Platform {
  private shortcuts = new Map<string, { parsed: ParsedAccelerator; callback: () => void }>();
  private views = new Map<TabId, WebContentsView>();

  constructor(private getActiveWindowId: () => WindowId | undefined) {}

  private getWin(windowId?: WindowId): BrowserWindow | undefined {
    const id = windowId ?? this.getActiveWindowId();
    if (!id) return undefined;
    return BrowserWindow.fromId(Number(id)) ?? undefined;
  }

  private getView(tabId: TabId): WebContentsView | undefined {
    return this.views.get(tabId);
  }

  // ── Window management ───────────────────────────────────────────

  async createWindow(): Promise<WindowId> {
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

  async createTab(windowId: WindowId, url: string): Promise<TabId> {
    const win = this.getWin(windowId);
    if (!win) throw new Error("No window found");

    const tabId = crypto.randomUUID() as TabId;
    const view = new WebContentsView();

    this.views.set(tabId, view);
    win.contentView.addChildView(view);

    // Hide initially — caller will activate
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    this.hookWebContents(view.webContents);
    view.webContents.loadURL(url);

    return tabId;
  }

  async closeTab(tabId: TabId): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;

    const win = this.getWin();
    if (win) {
      win.contentView.removeChildView(view);
    }

    // Destroy webContents by closing the view
    (view.webContents as { destroy?: () => void }).destroy?.();
    this.views.delete(tabId);
  }

  async activateTab(windowId: WindowId, tabId: TabId): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;
    // Showing is handled by showTab + setTabBounds
  }

  async navigateTab(tabId: TabId, url: string): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;
    view.webContents.loadURL(url);
  }

  getTabUrl(tabId: TabId): string | undefined {
    return this.views.get(tabId)?.webContents.getURL() || undefined;
  }

  getTabTitle(tabId: TabId): string | undefined {
    return this.views.get(tabId)?.webContents.getTitle() || undefined;
  }

  getTabFavicon(tabId: TabId): string | undefined {
    // Favicon is tracked via page-favicon-updated event in tabs.main.ts
    return undefined;
  }

  setTabBounds(tabId: TabId, bounds: Bounds): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  hideTab(tabId: TabId): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  showTab(tabId: TabId): void {
    // Showing is managed by setTabBounds — just a semantic marker
  }

  hideAllTabs(): void {
    for (const [tabId] of this.views) {
      this.hideTab(tabId);
    }
  }

  onTabEvent(tabId: TabId, event: string, callback: (...args: unknown[]) => void): () => void {
    const view = this.views.get(tabId);
    if (!view) return () => {};

    const wc = view.webContents;
    // biome-ignore lint/suspicious/noExplicitAny: Electron event names are dynamic
    wc.on(event as any, callback as any);
    return () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron event names are dynamic
      wc.removeListener(event as any, callback as any);
    };
  }

  // ── Tab navigation ────────────────────────────────────────────

  goBack(tabId: TabId): void {
    this.views.get(tabId)?.webContents.goBack();
  }

  goForward(tabId: TabId): void {
    this.views.get(tabId)?.webContents.goForward();
  }

  reload(tabId: TabId): void {
    this.views.get(tabId)?.webContents.reload();
  }

  canGoBack(tabId: TabId): boolean {
    return this.views.get(tabId)?.webContents.canGoBack() ?? false;
  }

  canGoForward(tabId: TabId): boolean {
    return this.views.get(tabId)?.webContents.canGoForward() ?? false;
  }

  // ── Session isolation ───────────────────────────────────────────

  async createIsolatedSession(_tabId: TabId): Promise<void> {
    throw new Error("Not implemented: createIsolatedSession");
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────

  registerShortcut(accelerator: string, callback: () => void): void {
    this.shortcuts.set(accelerator, {
      parsed: parseAccelerator(accelerator),
      callback,
    });
  }

  unregisterShortcut(accelerator: string): void {
    this.shortcuts.delete(accelerator);
  }

  hookWebContents(webContents: unknown): void {
    const wc = webContents as Electron.WebContents;
    wc.on("before-input-event", (event, input) => {
      for (const { parsed, callback } of this.shortcuts.values()) {
        if (matchesInput(parsed, input)) {
          event.preventDefault();
          callback();
          return;
        }
      }
    });
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

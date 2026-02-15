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
        if (process.platform === "darwin") {
          result.meta = true;
        } else {
          result.ctrl = true;
        }
        break;
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

const ALLOWED_SCHEMES = new Set(["http:", "https:", "about:", "data:"]);
const ALLOWED_EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
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

// Minimal HTML for the tooltip popup — transparent bg, matching app styling
const TOOLTIP_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{background:transparent;overflow:hidden}
#t{display:inline-block;padding:4px 10px;border-radius:6px;background:rgb(28,28,28,.94);
color:rgb(210,210,210);font:500 11px/1.4 system-ui,-apple-system,sans-serif;
letter-spacing:.01em;white-space:nowrap}
.a{animation:i .12s ease}@keyframes i{from{opacity:0;transform:scale(.96)}}
</style></head><body><span id="t"></span></body></html>`;

export class ElectronPlatform implements Platform {
  private shortcuts = new Map<string, { parsed: ParsedAccelerator; callback: () => void }>();
  private views = new Map<TabId, WebContentsView>();
  private tooltipWin: BrowserWindow | null = null;
  private permissionHandlerSet = false;

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
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    // Match the CSS border-radius of the content area (--radius = 0.5rem = 8px)
    view.setBorderRadius(8);

    this.views.set(tabId, view);
    win.contentView.addChildView(view);

    // Hide initially — caller will activate
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    if (!this.permissionHandlerSet) {
      const ses = view.webContents.session;
      ses.setPermissionRequestHandler((_wc, _permission, callback) => {
        callback(false);
      });
      ses.setPermissionCheckHandler(() => false);
      this.permissionHandlerSet = true;
    }

    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    view.webContents.on("will-navigate", (event, navUrl) => {
      if (!isAllowedUrl(navUrl)) {
        event.preventDefault();
      }
    });

    this.hookWebContents(view.webContents);

    if (!isAllowedUrl(url)) throw new Error(`Blocked URL scheme: ${url}`);
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

    await view.webContents.close({ waitForBeforeUnload: true });
    this.views.delete(tabId);
  }

  async navigateTab(tabId: TabId, url: string): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;
    if (!isAllowedUrl(url)) return;
    view.webContents.loadURL(url);
  }

  getTabUrl(tabId: TabId): string | undefined {
    return this.views.get(tabId)?.webContents.getURL() || undefined;
  }

  getTabTitle(tabId: TabId): string | undefined {
    return this.views.get(tabId)?.webContents.getTitle() || undefined;
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

  // ── Focus ──────────────────────────────────────────────────────

  focusShell(windowId?: WindowId): void {
    const win = this.getWin(windowId);
    if (win) win.webContents.focus();
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

  // ── Tooltip overlay ────────────────────────────────────────────

  initTooltipOverlay(windowId: WindowId): void {
    const parent = this.getWin(windowId);
    if (!parent) return;

    this.tooltipWin = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: { sandbox: true },
    });
    this.tooltipWin.setIgnoreMouseEvents(true);
    this.tooltipWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(TOOLTIP_HTML)}`);

    // Hide tooltip when parent moves/resizes (coordinates become stale)
    parent.on("move", () => this.hideTooltip());
    parent.on("resize", () => this.hideTooltip());
  }

  showTooltip(opts: {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    const win = this.getWin();
    if (!win || !this.tooltipWin) return;

    const cb = win.getContentBounds();

    this.tooltipWin.setBounds({
      x: Math.round(cb.x + opts.x),
      y: Math.round(cb.y + opts.y),
      width: Math.round(opts.width),
      height: Math.round(opts.height),
    });
    this.tooltipWin.webContents.executeJavaScript(
      `var t=document.getElementById('t');t.textContent=${JSON.stringify(opts.text)};t.className='';void t.offsetWidth;t.className='a';`,
    );
    this.tooltipWin.showInactive();
  }

  hideTooltip(): void {
    if (this.tooltipWin?.isVisible()) {
      this.tooltipWin.hide();
    }
  }

  // ── Shell / clipboard ───────────────────────────────────────────

  async openExternal(url: string): Promise<void> {
    if (!isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  }

  readClipboard(): string {
    return clipboard.readText();
  }

  writeClipboard(text: string): void {
    clipboard.writeText(text);
  }
}

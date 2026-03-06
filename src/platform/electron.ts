import fs from "node:fs";
import path from "node:path";
import {
  BrowserWindow,
  Menu,
  WebContentsView,
  app,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  session,
  shell,
  webContents,
} from "electron";
import type { TabId, WindowId } from "../shared/types";
import type { Bounds } from "../shared/types";
import type { Platform, PlatformDownload } from "./types";

const ALLOWED_SCHEMES_WEB = new Set(["http:", "https:", "about:", "data:"]);
const ALLOWED_SCHEMES_INTERNAL = new Set(["http:", "https:", "about:", "data:", "file:"]);
const ALLOWED_EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isAllowedUrl(url: string, source: "web" | "internal" = "web"): boolean {
  try {
    const parsed = new URL(url);
    const allow = source === "internal" ? ALLOWED_SCHEMES_INTERNAL : ALLOWED_SCHEMES_WEB;
    return allow.has(parsed.protocol);
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

// Minimal HTML for the tooltip popup — transparent bg, matching app styling
const TOOLTIP_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{background:transparent;overflow:hidden}
#t{display:inline-block;padding:4px 10px;border-radius:6px;background:rgb(28,28,28,.94);
color:rgb(210,210,210);font:500 11px/1.4 system-ui,-apple-system,sans-serif;
letter-spacing:.01em;white-space:nowrap}
.a{animation:i .12s ease}@keyframes i{from{opacity:0;transform:scale(.96)}}
</style></head><body><span id="t"></span></body></html>`;

// HTML for the context menu overlay — interactive, styled to match the app
// Generated at init time to inject the resolved FA webfont path
function buildContextMenuHtml(faFontPath: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"FA";font-style:normal;font-weight:900;font-display:block;src:url("file://${faFontPath}")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden;font-family:"Plus Jakarta Sans",-apple-system,system-ui,sans-serif}
body{padding:24px}
#m{display:inline-flex;flex-direction:column;gap:4px;min-width:180px;padding:5px;border-radius:10px;
background:rgba(22,22,26,.96);backdrop-filter:blur(24px) saturate(1.4);
-webkit-backdrop-filter:blur(24px) saturate(1.4);
box-shadow:0 8px 32px rgba(0,0,0,.4),0 2px 8px rgba(0,0,0,.2),
inset 0 0.5px 0 rgba(255,255,255,.1),inset 0 0 0 0.5px rgba(255,255,255,.06);
transform-origin:top left;visibility:hidden}
.i{display:flex;align-items:center;gap:9px;padding:7px 12px 7px 10px;border-radius:7px;
color:rgba(235,235,245,.85);font-size:12px;font-weight:500;letter-spacing:.01em;
cursor:pointer;user-select:none;
transition:background 80ms ease-out,color 80ms ease-out}
.i:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.95)}
.i:active{background:rgba(255,255,255,.16);color:#fff;transform:scale(.98);transition:transform 60ms}
.i[data-disabled]{color:rgba(235,235,245,.25);pointer-events:none}
.i[data-disabled] .ic{opacity:.3}
.ic{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;
font-family:"FA";font-weight:900;font-style:normal;font-size:11px;
color:rgba(235,235,245,.5);transition:color 80ms ease-out;
-webkit-font-smoothing:antialiased;text-rendering:auto}
.i:hover .ic{color:rgba(235,235,245,.8)}
.lb{flex:1;white-space:nowrap}
/* Entry animation */
#m{animation:menu-in 160ms cubic-bezier(0,0,.2,1) both}
.i{opacity:0;animation:item-in 120ms cubic-bezier(0,0,.2,1) both}
@keyframes menu-in{from{opacity:0;transform:scale(.92) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes item-in{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
</style></head><body><div id="m"></div>
<script>
const ICONS={
'bookmark':'\\uf02e','thumbtack':'\\uf08d','thumbtack-slash':'\\ue68f',
'xmark':'\\uf00d','sliders':'\\uf1de','arrow-rotate-left':'\\uf0e2','folder-plus':'\\uf65e'
};
let _resolve=null;
function _dismiss(){if(_resolve){_resolve(-1);_resolve=null}}
document.addEventListener('keydown',e=>{
  if(!_resolve)return;
  if(e.key==='Escape'){e.preventDefault();_dismiss()}
});
function renderMenu(items){
  const m=document.getElementById('m');
  m.innerHTML='';
  items.forEach((it,i)=>{
    const d=document.createElement('div');
    d.className='i';
    d.style.animationDelay=(i*30)+'ms';
    if(it.icon&&ICONS[it.icon]){
      const ic=document.createElement('span');
      ic.className='ic';
      ic.textContent=ICONS[it.icon];
      d.appendChild(ic);
    }
    const lb=document.createElement('span');
    lb.className='lb';
    lb.textContent=it.label;
    d.appendChild(lb);
    if(it.disabled)d.dataset.disabled='1';
    else d.addEventListener('click',()=>{if(_resolve){_resolve(i);_resolve=null}});
    m.appendChild(d);
  });
}
function revealMenu(){
  const m=document.getElementById('m');
  m.style.visibility='visible';
  m.style.animation='none';void m.offsetWidth;m.style.animation='';
  m.querySelectorAll('.i').forEach(el=>{el.style.animation='none';void el.offsetWidth;el.style.animation=''});
}
function awaitSelection(){
  return new Promise(r=>{_resolve=r});
}
</script></body></html>`;
}

export class ElectronPlatform implements Platform {
  private shortcuts = new Map<string, () => void>();
  private localShortcuts = new Map<string, () => void>();
  private views = new Map<TabId, WebContentsView>();
  private tooltipWin: BrowserWindow | null = null;
  private ctxWin: BrowserWindow | null = null;
  private ctxResolve: ((index: number) => void) | null = null;
  private ctxParentListenersSet = false;
  private permissionHandlerSet = false;
  private zoomIpcHooked = false;

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

  getWindowBounds(windowId: WindowId): Bounds | undefined {
    return this.getWin(windowId)?.getBounds();
  }

  setWindowBounds(windowId: WindowId, bounds: Bounds): void {
    this.getWin(windowId)?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
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
        preload: path.join(__dirname, "../preload/tab.js"),
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

    view.webContents.setWindowOpenHandler(({ url }) => {
      // Don't open new windows — navigate the current tab instead.
      // This handles target="_blank" links, including download URLs.
      if (isAllowedUrl(url)) {
        view.webContents.loadURL(url);
      }
      return { action: "deny" };
    });

    view.webContents.on("will-navigate", (event, navUrl) => {
      if (!isAllowedUrl(navUrl)) {
        event.preventDefault();
      }
    });

    this.hookWebContents(view.webContents);

    // The tab preload applies Ctrl+wheel zoom via webFrame and sends
    // the resulting level here. We re-emit as a synthetic zoom-changed
    // event so the zoom feature can read the new level and update state.
    if (!this.zoomIpcHooked) {
      ipcMain.on("tab:zoom-applied", (event: Electron.IpcMainEvent) => {
        if (Array.from(this.views.values()).some((v) => v.webContents === event.sender)) {
          event.sender.emit("zoom-changed");
        }
      });
      this.zoomIpcHooked = true;
    }

    if (!isAllowedUrl(url, "internal")) throw new Error(`Blocked URL scheme: ${url}`);
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
    if (!isAllowedUrl(url, "internal")) return;
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

  setTabBorderRadius(tabId: TabId, radius: number): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.setBorderRadius(Math.round(radius));
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

  // ── Zoom ──────────────────────────────────────────────────────

  setTabZoomLevel(tabId: TabId, level: number): void {
    this.views.get(tabId)?.webContents.setZoomLevel(level);
  }

  getTabZoomLevel(tabId: TabId): number {
    return this.views.get(tabId)?.webContents.getZoomLevel() ?? 0;
  }

  // ── DevTools ────────────────────────────────────────────────────

  openTabDevTools(tabId: TabId, mode: "right" | "bottom" | "undocked" | "detach" = "right"): void {
    this.views.get(tabId)?.webContents.openDevTools({ mode });
  }

  closeTabDevTools(tabId: TabId): void {
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return;
    wc.closeDevTools();
    wc.focus();
  }

  isTabDevToolsOpened(tabId: TabId): boolean {
    return this.views.get(tabId)?.webContents.isDevToolsOpened() ?? false;
  }

  toggleShellDevTools(windowId?: WindowId): void {
    const win = this.getWin(windowId);
    if (!win) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: "detach" });
    }
  }

  // ── Focus ──────────────────────────────────────────────────────

  focusShell(windowId?: WindowId): void {
    const win = this.getWin(windowId);
    if (win) win.webContents.focus();
  }

  // ── Keyboard shortcuts (via globalShortcut, toggled on focus/blur) ──

  private shortcutsActive = false;

  /** Register all stored shortcuts as OS-level global shortcuts. */
  activateShortcuts(): void {
    if (this.shortcutsActive) return;
    for (const [accelerator, callback] of this.shortcuts) {
      globalShortcut.register(accelerator, callback);
    }
    this.shortcutsActive = true;
  }

  /** Unregister all OS-level global shortcuts. */
  deactivateShortcuts(): void {
    if (!this.shortcutsActive) return;
    for (const accelerator of this.shortcuts.keys()) {
      globalShortcut.unregister(accelerator);
    }
    this.shortcutsActive = false;
  }

  registerShortcut(accelerator: string, callback: () => void): void {
    if (process.env.NODE_ENV === "test") {
      // In tests, use local shortcuts so sendInputEvent triggers them via
      // before-input-event. globalShortcut doesn't fire for synthetic events
      // and conflicts between parallel Electron instances on the same display.
      this.registerLocalShortcut(accelerator, callback);
      return;
    }
    this.shortcuts.set(accelerator, callback);
    if (this.shortcutsActive) {
      globalShortcut.register(accelerator, callback);
    }
  }

  unregisterShortcut(accelerator: string): void {
    if (process.env.NODE_ENV === "test") {
      this.localShortcuts.delete(accelerator);
      this.rebuildLocalShortcutMenu();
      return;
    }
    this.shortcuts.delete(accelerator);
    if (this.shortcutsActive) {
      globalShortcut.unregister(accelerator);
    }
  }

  registerLocalShortcut(accelerator: string, callback: () => void): void {
    this.localShortcuts.set(accelerator, callback);
    this.rebuildLocalShortcutMenu();
  }

  /** Rebuild the app menu so local shortcuts also work as menu accelerators
   *  (needed for keys like F12 that can't be globalShortcut and whose
   *  before-input-event doesn't fire on devtools webContents). */
  private rebuildLocalShortcutMenu(): void {
    const template = Array.from(this.localShortcuts.entries()).map(([accelerator, click]) => ({
      label: accelerator,
      accelerator,
      click,
    }));
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  hookWebContents(webContents: unknown): void {
    const wc = webContents as Electron.WebContents;
    wc.on("before-input-event", (_event, input) => {
      if (input.type !== "keyDown") return;
      for (const [accelerator, cb] of this.localShortcuts) {
        if (this.matchesAccelerator(input, accelerator)) {
          _event.preventDefault();
          cb();
          return;
        }
      }
    });
  }

  private matchesAccelerator(input: Electron.Input, accelerator: string): boolean {
    const parts = accelerator.split("+");
    let wantCtrl = false;
    let wantShift = false;
    let wantAlt = false;
    let wantMeta = false;
    let key = "";
    for (const part of parts) {
      const p = part.trim();
      const lower = p.toLowerCase();
      if (lower === "control" || lower === "ctrl" || lower === "commandorcontrol") {
        wantCtrl = true;
      } else if (lower === "shift") {
        wantShift = true;
      } else if (lower === "alt") {
        wantAlt = true;
      } else if (lower === "meta" || lower === "command" || lower === "super") {
        wantMeta = true;
      } else {
        key = p;
      }
    }
    return (
      input.key.toLowerCase() === key.toLowerCase() &&
      input.control === wantCtrl &&
      input.shift === wantShift &&
      input.alt === wantAlt &&
      input.meta === wantMeta
    );
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
    if (!win || win.isDestroyed() || !this.tooltipWin || this.tooltipWin.isDestroyed()) return;

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
    if (this.tooltipWin && !this.tooltipWin.isDestroyed() && this.tooltipWin.isVisible()) {
      this.tooltipWin.hide();
    }
  }

  // ── Context menu overlay ──────────────────────────────────────

  initContextMenuOverlay(windowId: WindowId): void {
    const parent = this.getWin(windowId);
    if (!parent) return;
    if (this.ctxWin && !this.ctxWin.isDestroyed()) return;

    this.ctxWin = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      focusable: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: { sandbox: true },
    });

    // Resolve FA webfont path and write HTML to temp file so file:// font refs work
    const rawPath = path
      .join(
        __dirname,
        "../../node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2",
      )
      .replace(/\\/g, "/");
    // file:// URLs need three slashes before drive letter on Windows (file:///C:/...)
    const faFontPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const html = buildContextMenuHtml(faFontPath);
    const tmpPath = path.join(app.getPath("temp"), "chiaroscuro-ctx-menu.html");
    fs.writeFileSync(tmpPath, html, "utf-8");
    this.ctxWin.loadFile(tmpPath);

    // Dismiss on blur (click outside)
    this.ctxWin.on("blur", () => this.hideContextMenu());

    // Dismiss when parent moves/resizes (register once to avoid accumulation)
    if (!this.ctxParentListenersSet) {
      parent.on("move", () => this.hideContextMenu());
      parent.on("resize", () => this.hideContextMenu());
      this.ctxParentListenersSet = true;
    }
  }

  async showContextMenu(opts: {
    items: { label: string; icon?: string; disabled?: boolean }[];
    x: number;
    y: number;
  }): Promise<number> {
    const win = this.getWin();
    if (!win || win.isDestroyed() || !this.ctxWin || this.ctxWin.isDestroyed()) return -1;

    // Dismiss any pending menu
    this.dismissCtxMenu();

    const cb = win.getContentBounds();

    // Render items and measure (body padding provides space for box-shadow)
    const itemsJson = JSON.stringify(opts.items);
    let size: [number, number];
    try {
      await this.ctxWin.webContents.executeJavaScript(`renderMenu(${itemsJson})`);
      size = await this.ctxWin.webContents.executeJavaScript(
        "(()=>{const m=document.getElementById('m');const s=getComputedStyle(document.body);" +
          "return[m.offsetWidth+parseInt(s.paddingLeft)+parseInt(s.paddingRight)," +
          "m.offsetHeight+parseInt(s.paddingTop)+parseInt(s.paddingBottom)]})()",
      );
    } catch {
      this.dismissCtxMenu();
      return -1;
    }

    // Body padding offsets the menu element from the window edge (for shadow space)
    const padLeft = 24;
    const padTop = 24;

    // Edge detection — keep menu within parent window bounds
    let x = cb.x + opts.x - padLeft;
    let y = cb.y + opts.y - padTop;
    const parentBounds = win.getBounds();
    const margin = 6;
    if (x + size[0] > parentBounds.x + parentBounds.width - margin) {
      x = parentBounds.x + parentBounds.width - size[0] - margin;
    }
    if (y + size[1] > parentBounds.y + parentBounds.height - margin) {
      y = parentBounds.y + parentBounds.height - size[1] - margin;
    }
    if (x < parentBounds.x + margin) x = parentBounds.x + margin;
    if (y < parentBounds.y + margin) y = parentBounds.y + margin;

    this.ctxWin.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(size[0]),
      height: Math.round(size[1]),
    });
    this.ctxWin.show();

    // Reveal menu content after window is shown to avoid animation flash
    try {
      await this.ctxWin.webContents.executeJavaScript("revealMenu()");
    } catch {
      // ignore — menu may have been dismissed
    }

    // Also hide tooltip so it doesn't overlap
    this.hideTooltip();

    return new Promise<number>((resolve) => {
      this.ctxResolve = resolve;
      this.ctxWin?.webContents
        .executeJavaScript("awaitSelection()")
        .then((index: number) => {
          if (this.ctxResolve === resolve) {
            this.ctxResolve = null;
            this.ctxWin?.hide();
            this.refocusParent();
            resolve(index);
          }
        })
        .catch(() => {
          if (this.ctxResolve === resolve) {
            this.ctxResolve = null;
            this.ctxWin?.hide();
            this.refocusParent();
            resolve(-1);
          }
        });
    });
  }

  hideContextMenu(): void {
    this.dismissCtxMenu();
  }

  private dismissCtxMenu(): void {
    if (this.ctxResolve) {
      this.ctxResolve(-1);
      this.ctxResolve = null;
    }
    if (this.ctxWin && !this.ctxWin.isDestroyed() && this.ctxWin.isVisible()) {
      this.ctxWin.hide();
      this.refocusParent();
    }
  }

  private refocusParent(): void {
    const win = this.getWin();
    if (win && !win.isDestroyed()) win.webContents.focus();
  }

  // ── Downloads ──────────────────────────────────────────────────

  onDownload(callback: (download: PlatformDownload) => void): () => void {
    const handler = (_event: Electron.Event, item: Electron.DownloadItem) => {
      // Map original callbacks to wrapped versions that strip the Electron Event arg
      // biome-ignore lint/suspicious/noExplicitAny: Electron event callback types
      const cbMap = new Map<(...args: any[]) => void, (...args: any[]) => void>();

      const wrapped: PlatformDownload = {
        filename: item.getFilename(),
        url: item.getURL(),
        totalBytes: item.getTotalBytes(),
        setSavePath: (p) => item.setSavePath(p),
        cancel: () => item.cancel(),
        pause: () => item.pause(),
        resume: () => item.resume(),
        isPaused: () => item.isPaused(),
        getReceivedBytes: () => item.getReceivedBytes(),
        // biome-ignore lint/suspicious/noExplicitAny: Electron event overloads
        on: (event: string, cb: (...args: any[]) => void) => {
          // biome-ignore lint/suspicious/noExplicitAny: Electron event overloads
          const inner = (_e: any, ...rest: any[]) => cb(...rest);
          cbMap.set(cb, inner);
          // biome-ignore lint/suspicious/noExplicitAny: Electron event overloads
          item.on(event as any, inner as any);
        },
        // biome-ignore lint/suspicious/noExplicitAny: Electron event overloads
        removeListener: (event: string, cb: (...args: any[]) => void) => {
          const inner = cbMap.get(cb) ?? cb;
          cbMap.delete(cb);
          // biome-ignore lint/suspicious/noExplicitAny: Electron event overloads
          item.removeListener(event as any, inner as any);
        },
      };
      callback(wrapped);
    };

    // Register on all sessions (default + any already-created by tabs) and
    // future sessions so downloads from WebContentsView tabs are always caught.
    const registered = new Set<Electron.Session>();
    const addSession = (ses: Electron.Session) => {
      if (registered.has(ses)) return;
      registered.add(ses);
      ses.on("will-download", handler);
    };
    addSession(session.defaultSession);
    for (const wc of webContents.getAllWebContents()) {
      addSession(wc.session);
    }
    const onWcCreated = (_event: Electron.Event, wc: Electron.WebContents) =>
      addSession(wc.session);
    app.on("web-contents-created", onWcCreated);

    return () => {
      app.removeListener("web-contents-created", onWcCreated);
      for (const ses of registered) {
        ses.removeListener("will-download", handler);
      }
    };
  }

  getDesktopPath(): string {
    return app.getPath("desktop");
  }

  // ── CSS injection ───────────────────────────────────────────────

  async insertCSS(tabId: TabId, css: string): Promise<string> {
    const view = this.views.get(tabId);
    if (!view) throw new Error(`No view for tab ${tabId}`);
    return view.webContents.insertCSS(css);
  }

  async removeInsertedCSS(tabId: TabId, key: string): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;
    await view.webContents.removeInsertedCSS(key);
  }

  // ── Dialogs ───────────────────────────────────────────────────
  async showOpenDialog(options: { title?: string; properties?: string[] }): Promise<string[]> {
    const win = this.getWin();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      title: options.title,
      properties: (options.properties ?? [
        "openDirectory",
      ]) as Electron.OpenDialogOptions["properties"],
    });
    return result.canceled ? [] : result.filePaths;
  }

  // ── Shell / clipboard ───────────────────────────────────────────

  async openExternal(url: string): Promise<void> {
    if (!isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  }

  async openPath(filePath: string): Promise<void> {
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) {
      throw new Error(`Failed to open path "${filePath}": ${errorMessage}`);
    }
  }

  readClipboard(): string {
    return clipboard.readText();
  }

  writeClipboard(text: string): void {
    clipboard.writeText(text);
  }
}

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

// HTML for the context menu overlay — interactive, styled to match the app
const CONTEXT_MENU_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}
#m{display:inline-block;min-width:160px;padding:4px 0;border-radius:8px;
background:rgb(28,28,28,.92);backdrop-filter:blur(20px);
box-shadow:0 8px 32px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.3),inset 0 0 0 1px rgba(255,255,255,.08);
animation:ci .12s ease both}
.i{display:flex;align-items:center;padding:6px 12px;margin:0 4px;border-radius:6px;
color:rgb(224,224,224);font-size:13px;font-weight:500;letter-spacing:.01em;
cursor:pointer;user-select:none;transition:background 60ms}
.i:hover,.i.focused{background:rgba(255,255,255,.1)}
.i:active{background:rgba(255,255,255,.15)}
.i[data-disabled]{color:rgba(210,210,210,.35);pointer-events:none}
@keyframes ci{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
</style></head><body><div id="m"></div>
<script>
let _resolve=null,_focus=-1,_items=[];
function _setFocus(idx){
  const els=document.querySelectorAll('.i');
  if(_focus>=0&&_focus<els.length)els[_focus].classList.remove('focused');
  _focus=idx;
  if(_focus>=0&&_focus<els.length)els[_focus].classList.add('focused');
}
function _moveFocus(dir){
  if(!_items.length)return;
  let next=_focus;
  for(let t=0;t<_items.length;t++){
    next=(next+dir+_items.length)%_items.length;
    if(!_items[next].disabled){_setFocus(next);return}
  }
}
function _dismiss(){if(_resolve){_resolve(-1);_resolve=null}}
function _select(){if(_focus>=0&&!_items[_focus].disabled&&_resolve){_resolve(_focus);_resolve=null}}
document.addEventListener('keydown',e=>{
  if(!_resolve)return;
  if(e.key==='Escape'){e.preventDefault();_dismiss()}
  else if(e.key==='ArrowDown'){e.preventDefault();_moveFocus(1)}
  else if(e.key==='ArrowUp'){e.preventDefault();_moveFocus(-1)}
  else if(e.key==='Enter'){e.preventDefault();_select()}
});
function renderMenu(items){
  _items=items;_focus=-1;
  const m=document.getElementById('m');
  m.innerHTML='';
  items.forEach((it,i)=>{
    const d=document.createElement('div');
    d.className='i';
    d.textContent=it.label;
    if(it.disabled)d.dataset.disabled='1';
    else d.addEventListener('click',()=>{if(_resolve){_resolve(i);_resolve=null}});
    m.appendChild(d);
  });
  m.style.animation='none';void m.offsetWidth;m.style.animation='';
  _moveFocus(1);
}
function awaitSelection(){
  return new Promise(r=>{_resolve=r});
}
</script></body></html>`;

export class ElectronPlatform implements Platform {
  private shortcuts = new Map<string, { parsed: ParsedAccelerator; callback: () => void }>();
  private views = new Map<TabId, WebContentsView>();
  private tooltipWin: BrowserWindow | null = null;
  private ctxWin: BrowserWindow | null = null;
  private ctxResolve: ((index: number) => void) | null = null;
  private ctxParentListenersSet = false;
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
    this.ctxWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CONTEXT_MENU_HTML)}`);

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
    items: { label: string; disabled?: boolean }[];
    x: number;
    y: number;
  }): Promise<number> {
    const win = this.getWin();
    if (!win || !this.ctxWin) return -1;

    // Dismiss any pending menu
    this.dismissCtxMenu();

    const cb = win.getContentBounds();

    // Render items and measure
    const itemsJson = JSON.stringify(opts.items);
    let size: [number, number];
    try {
      await this.ctxWin.webContents.executeJavaScript(`renderMenu(${itemsJson})`);
      size = await this.ctxWin.webContents.executeJavaScript(
        `[document.getElementById('m').offsetWidth, document.getElementById('m').offsetHeight]`,
      );
    } catch {
      this.dismissCtxMenu();
      return -1;
    }

    // Edge detection — keep menu within parent window bounds
    let x = cb.x + opts.x;
    let y = cb.y + opts.y;
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
    if (this.ctxWin?.isVisible()) {
      this.ctxWin.hide();
      this.refocusParent();
    }
  }

  private refocusParent(): void {
    const win = this.getWin();
    if (win) win.webContents.focus();
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

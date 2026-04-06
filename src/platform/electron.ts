import fs from "node:fs";
import path from "node:path";
import {
  net,
  BrowserWindow,
  Menu,
  WebContentsView,
  app,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
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

// HTML for the sub-tab child window — full backdrop + close/promote buttons.
// The sub-tab WCV is added as a child view and renders on top of this HTML,
// so no hole/passthrough is needed — the backdrop covers everything and the
// WCV naturally occludes the area it covers.
function buildSubTabWindowHtml(faCssDir: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${faCssDir}/fontawesome.css">
<link rel="stylesheet" href="file://${faCssDir}/solid.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}html,body{background:transparent;overflow:hidden;width:100%;height:100%}
#backdrop{position:fixed;inset:0;background:oklch(0 0 0/0.5);border-radius:8px;opacity:0;transition:none}
#btns{position:absolute;display:flex;flex-direction:column;gap:12px;align-items:center;pointer-events:auto}
button{width:48px;height:48px;border-radius:50%;border:none;background:white;
color:oklch(0.35 0 0);font-size:1.125rem;
box-shadow:0 4px 20px oklch(0 0 0/0.25),0 1px 3px oklch(0 0 0/0.15);
cursor:pointer;display:flex;align-items:center;justify-content:center;
transition:transform 200ms cubic-bezier(0.34,1.56,0.64,1);-webkit-font-smoothing:antialiased}
button:hover{transform:scale(1.15)}button:active{transform:scale(0.95)}
</style></head><body>
<div id="backdrop"></div>
<div id="btns" style="display:none">
<button id="c" aria-label="Close sub-tab"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
<button id="p" aria-label="Open as tab"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
</div>
<script>
var bd=document.getElementById('backdrop'),btns=document.getElementById('btns');
var pid=null,animId=null,D=200;
function setParentTabId(id){pid=id}
function positionButtons(fx,fy,fw,fh){
  var gap=12,btnH=108;
  btns.style.left=(fx+fw+gap)+'px';
  btns.style.top=(fy+gap)+'px';
  btns.style.display='flex';
}
function cancelAnim(){if(animId){cancelAnimationFrame(animId);animId=null}}
function enterAnimation(fx,fy,fw,fh){
  return new Promise(function(resolve){
    cancelAnim();
    positionButtons(fx,fy,fw,fh);
    var start=performance.now();
    function tick(now){
      var t=Math.min((now-start)/D,1);
      bd.style.opacity=1-(1-t)*(1-t);
      if(t<1){animId=requestAnimationFrame(tick)}else{animId=null;resolve()}
    }
    animId=requestAnimationFrame(tick);
  });
}
function exitAnimation(){
  return new Promise(function(resolve){
    cancelAnim();var start=performance.now();
    function tick(now){
      var t=Math.min((now-start)/D,1);
      bd.style.opacity=1-t*t;
      if(t<1){animId=requestAnimationFrame(tick)}else{animId=null;bd.style.opacity=0;btns.style.display='none';resolve()}
    }
    animId=requestAnimationFrame(tick);
  });
}
function showStatic(fx,fy,fw,fh){cancelAnim();bd.style.opacity=1;positionButtons(fx,fy,fw,fh)}
function hide(){cancelAnim();bd.style.opacity=0;btns.style.display='none'}
function updateButtons(fx,fy,fw,fh){positionButtons(fx,fy,fw,fh)}
bd.addEventListener('click',function(){if(pid)window.chiaroscuro.sendCommand('sub-tabs:close',{parentTabId:pid})});
document.getElementById('c').onclick=function(){if(pid)window.chiaroscuro.sendCommand('sub-tabs:close',{parentTabId:pid})};
document.getElementById('p').onclick=function(){if(pid)window.chiaroscuro.sendCommand('sub-tabs:promote',{parentTabId:pid})};
</script></body></html>`;
}

// Minimal HTML for the tooltip popup — transparent bg, matching app styling
const TOOLTIP_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{background:transparent;overflow:hidden}
#t{display:inline-block;padding:4px 10px;border-radius:6px;background:rgb(28,28,28,.94);
color:rgb(210,210,210);font:500 11px/1.4 system-ui,-apple-system,sans-serif;
letter-spacing:.01em;white-space:nowrap}
.a{animation:i .12s ease}@keyframes i{from{opacity:0;transform:scale(.96)}}
</style></head><body><span id="t"></span></body></html>`;

// HTML for the command palette overlay — transparent BrowserWindow on top of tab views
const COMMAND_PALETTE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden;
  font-family:"Plus Jakarta Sans",-apple-system,system-ui,sans-serif}
#backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  border-radius:8px;
  background:oklch(0 0 0/.4);
  opacity:0;visibility:hidden;transition:opacity .2s cubic-bezier(0,0,.2,1),visibility 0s .2s}
#backdrop.open{opacity:1;visibility:visible;transition:opacity .2s cubic-bezier(0,0,.2,1),visibility 0s 0s}
#panel{width:560px;display:flex;flex-direction:column;
  background:rgb(22,22,26);
  border-radius:16px;border:1px solid oklch(1 0 0/.08);
  box-shadow:0 8px 32px oklch(0 0 0/.4),0 2px 8px oklch(0 0 0/.2),
    inset 0 .5px 0 oklch(1 0 0/.1),inset 0 0 0 .5px oklch(1 0 0/.06);
  opacity:0;scale:.96;transition:opacity .15s cubic-bezier(0,0,.2,1),scale .15s cubic-bezier(0,0,.2,1)}
#backdrop.open #panel{opacity:1;scale:1}
#input{width:100%;background:transparent;border:none;outline:none;
  color:oklch(1 0 0/.95);font-size:.875rem;padding:14px 18px;font-family:inherit}
#input::placeholder{color:oklch(1 0 0/.3)}
#res{padding:0 18px 8px;font-size:.6875rem;color:oklch(1 0 0/.4);display:none}
#res strong{color:oklch(1 0 0/.55)}
#suggestions{border-top:1px solid oklch(1 0 0/.07);max-height:240px;overflow-y:auto;display:none;
  scrollbar-width:thin;scrollbar-color:oklch(1 0 0/.12) transparent}
#suggestions::-webkit-scrollbar{width:5px}
#suggestions::-webkit-scrollbar-track{background:transparent}
#suggestions::-webkit-scrollbar-thumb{background:oklch(1 0 0/.12);border-radius:999px}
#suggestions::-webkit-scrollbar-thumb:hover{background:oklch(1 0 0/.25)}
.sg{display:flex;align-items:center;gap:.625rem;padding:7px 18px;cursor:pointer;
  font-size:.6875rem;border-radius:7px;margin:2px 5px;
  transition:background 80ms ease-out}
.sg:hover,.sg.sel{background:oklch(1 0 0/.1)}
.sg .title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:oklch(1 0 0/.55)}
.sg .url{flex-shrink:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;color:oklch(1 0 0/.4);font-size:.5625rem}
#hints{padding:8px 18px 10px;font-size:.6875rem;color:oklch(1 0 0/.3);
  border-top:1px solid oklch(1 0 0/.07)}
</style></head><body>
<div id="backdrop" onclick="closePalette()">
<div id="panel" onclick="event.stopPropagation()">
<input id="input" type="text" placeholder="Search or enter URL..."
  autocomplete="off" spellcheck="false" aria-label="Search or enter URL">
<div id="res"></div>
<div id="suggestions"></div>
<div id="hints">Enter = new tab &middot; Ctrl+Enter = current tab &middot; Esc = close</div>
</div></div>
<script>
var providerConfig=null,debounceTimer=null,suggestions=[],selIdx=-1;
var $=id=>document.getElementById(id);

function resetPalette(){
  $('input').value='';
  $('res').style.display='none';
  $('suggestions').style.display='none';
  $('suggestions').innerHTML='';
  suggestions=[];selIdx=-1;
  setTimeout(()=>{$('backdrop').classList.add('open');$('input').focus()},16);
}

function closePalette(){
  $('backdrop').classList.remove('open');
  window.chiaroscuro.sendCommand('command-palette:hide',undefined);
}

function resolveInput(v){
  v=v.trim();if(!v)return null;
  if(/^(?:https?|file):\\/\\//i.test(v))return{type:'url',url:v};
  if(/^[A-Za-z]:[/\\\\]/.test(v))return{type:'url',url:'file:///'+v.replace(/\\\\/g,'/')};
  if(/^[^\\s]+\\.[^\\s]+$/.test(v)&&v.length>2)return{type:'url',url:'https://'+v};
  if(v.startsWith('!')){
    var parts=v.slice(1).split(/\\s+/,2),bang=parts[0]||'';
    if(providerConfig){
      var p=providerConfig.providers.find(function(x){return x.bang==='!'+bang});
      if(p)return{type:'search',provider:p.name};
    }
    return{type:'search',provider:'default'};
  }
  if(v.startsWith('/'))return{type:'builtin'};
  var name='Google';
  if(providerConfig){
    var dp=providerConfig.providers.find(function(x){return x.id===providerConfig.defaultBang});
    if(dp)name=dp.name;
  }
  return{type:'search',provider:name};
}

function updateResolution(){
  var r=resolveInput($('input').value);
  var el=$('res');
  if(!r||r.type==='builtin'){el.style.display='none';return}
  el.style.display='block';
  el.textContent=r.type==='search'?'Search with ':'Navigate to ';
  var strong=document.createElement('strong');
  strong.textContent=r.type==='search'?r.provider:r.url;
  el.appendChild(strong);
}

function renderSuggestions(){
  var el=$('suggestions');
  if(!suggestions.length){el.style.display='none';el.innerHTML='';return}
  el.style.display='block';
  el.innerHTML=suggestions.map(function(s,i){
    return '<div class="sg'+(i===selIdx?' sel':'')+'" data-i="'+i+'">'
      +'<span class="title">'+esc(s.title)+'</span>'
      +'<span class="url">'+esc(s.url)+'</span></div>';
  }).join('');
}
function esc(s){var d=document.createElement('span');d.textContent=s;return d.innerHTML}

function execute(value,inCurrentTab){
  if(!value.trim())return;
  window.chiaroscuro.sendCommand('command-palette:execute',{command:value,inCurrentTab:inCurrentTab});
  window.chiaroscuro.sendCommand('command-palette:hide',undefined);
}

$('input').addEventListener('input',function(){
  updateResolution();selIdx=-1;
  clearTimeout(debounceTimer);
  var q=$('input').value.trim();
  if(q.startsWith('/')){
    window.chiaroscuro.sendCommand('command-palette:search-visits',{query:q})
      .then(function(r){suggestions=r||[];renderSuggestions()})
      .catch(function(){suggestions=[];renderSuggestions()});
    return;
  }
  if(q.length>=2){
    debounceTimer=setTimeout(function(){
      window.chiaroscuro.sendCommand('command-palette:search-visits',{query:q})
        .then(function(r){suggestions=r||[];renderSuggestions()})
        .catch(function(){suggestions=[];renderSuggestions()});
    },150);
  }else{suggestions=[];renderSuggestions()}
});

$('input').addEventListener('keydown',function(e){
  if(e.key==='Escape'){closePalette();return}
  if(suggestions.length>0){
    if(e.key==='ArrowDown'){e.preventDefault();selIdx=Math.min(selIdx+1,suggestions.length-1);renderSuggestions();return}
    if(e.key==='ArrowUp'){e.preventDefault();selIdx=Math.max(selIdx-1,-1);renderSuggestions();return}
  }
  if(e.key==='Enter'){
    if(selIdx>=0&&suggestions[selIdx]){execute(suggestions[selIdx].url,e.ctrlKey||e.metaKey);return}
    execute($('input').value,e.ctrlKey||e.metaKey);
  }
});

$('suggestions').addEventListener('click',function(e){
  var t=e.target.closest('.sg');if(!t)return;
  var i=parseInt(t.dataset.i);if(suggestions[i])execute(suggestions[i].url,false);
});

document.addEventListener('keydown',function(e){if(e.key==='Escape')closePalette()});
</script></body></html>`;

export class ElectronPlatform implements Platform {
  private shortcuts = new Map<string, () => void>();
  private localShortcuts = new Map<string, () => void>();
  private views = new Map<TabId, WebContentsView>();
  private tooltipWin: BrowserWindow | null = null;
  private paletteWin: BrowserWindow | null = null;
  private paletteParentListenersSet = false;
  private subTabWin: BrowserWindow | null = null;
  private subTabWinReady = false;
  private subTabWinParentListenersSet = false;
  private subTabWinContentBounds: Bounds | null = null;
  private tabBoundsAnimations = new Map<string, () => void>();
  private pendingPaletteJs: string | null = null;
  private permissionRequestHandler:
    | ((
        tabId: TabId,
        permission: string,
        details: { requestingUrl: string; isMainFrame: boolean; mediaTypes?: string[] },
      ) => Promise<boolean>)
    | undefined;
  private permissionCheckHandler:
    | ((
        tabId: TabId,
        permission: string,
        requestingOrigin: string,
        details: { mediaType?: string },
      ) => boolean)
    | undefined;
  private sessionsWithHandlers = new WeakSet<Electron.Session>();
  private deviceSelectedCallback: ((deviceType: string, origin: string) => void) | undefined;
  // origin → Array<{deviceType, device}> for setDevicePermissionHandler
  private grantedDevices = new Map<string, Array<{ deviceType: string; device: unknown }>>();
  private zoomIpcHooked = false;
  private protocolRequestCallback: ((url: string, origin: string) => void) | undefined;
  private windowOpenCallback:
    | ((url: string, sourceTabId: TabId, disposition: string) => boolean)
    | undefined;

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

  async createTab(
    windowId: WindowId,
    url: string,
    existingTabId?: TabId,
    options?: { lazy?: boolean },
  ): Promise<TabId> {
    const win = this.getWin(windowId);
    if (!win) throw new Error("No window found");

    const tabId = existingTabId ?? (crypto.randomUUID() as TabId);
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

    const ses = view.webContents.session;
    if (!this.sessionsWithHandlers.has(ses)) {
      this.installPermissionHandlers(ses);
      this.installDevicePermissionHandlers(ses);
      this.sessionsWithHandlers.add(ses);
    }

    view.webContents.setWindowOpenHandler(({ url, disposition }) => {
      if (isAllowedUrl(url)) {
        // Let registered callback handle it (sub-tabs for links, etc.)
        if (this.windowOpenCallback?.(url, tabId, disposition)) {
          return { action: "deny" as const };
        }
        // Fallback: open as a real popup window so window.opener works
        // (needed for OAuth flows, payment windows, etc.)
        const parent = this.getWin();
        return {
          action: "allow" as const,
          overrideBrowserWindowOptions: {
            parent,
            autoHideMenuBar: true,
            webPreferences: { sandbox: true, contextIsolation: true },
          },
        };
      }
      if (this.protocolRequestCallback) {
        try {
          const parsed = new URL(url);
          if (
            parsed.protocol &&
            parsed.protocol !== "about:" &&
            parsed.protocol !== "data:" &&
            parsed.protocol !== "file:"
          ) {
            const currentUrl = view.webContents.getURL();
            const origin = currentUrl ? new URL(currentUrl).origin : "";
            this.protocolRequestCallback(url, origin);
          }
        } catch {
          // Invalid URL — ignore
        }
      }
      return { action: "deny" as const };
    });

    // Secure popup windows created by the above handler — guard navigation
    // and prevent nested popups from escaping to disallowed URLs.
    view.webContents.on("did-create-window", (popupWin) => {
      const wc = popupWin.webContents;

      wc.setWindowOpenHandler(({ url: childUrl }) => {
        if (isAllowedUrl(childUrl)) {
          wc.loadURL(childUrl);
        }
        return { action: "deny" as const };
      });

      wc.on("will-navigate", (event, navUrl) => {
        if (!isAllowedUrl(navUrl)) {
          event.preventDefault();
        }
      });

      this.hookWebContents(wc);
    });

    view.webContents.on("will-navigate", (event, navUrl) => {
      if (!isAllowedUrl(navUrl)) {
        event.preventDefault();
        try {
          const parsed = new URL(navUrl);
          // Notify listeners about non-standard protocol navigation
          if (
            this.protocolRequestCallback &&
            parsed.protocol &&
            parsed.protocol !== "about:" &&
            parsed.protocol !== "data:" &&
            parsed.protocol !== "file:"
          ) {
            const currentUrl = view.webContents.getURL();
            const origin = currentUrl ? new URL(currentUrl).origin : "";
            this.protocolRequestCallback(navUrl, origin);
          }
        } catch {
          // Invalid URL — ignore
        }
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

    if (!options?.lazy) {
      if (!isAllowedUrl(url, "internal")) throw new Error(`Blocked URL scheme: ${url}`);
      view.webContents.loadURL(url);
    }

    return tabId;
  }

  async closeTab(tabId: TabId): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return;

    // Remove from whichever window owns the view (main or sub-tab child window)
    const win = this.getWin();
    if (win) {
      try {
        win.contentView.removeChildView(view);
      } catch {
        // may not be a child of main window
      }
    }
    if (this.subTabWin && !this.subTabWin.isDestroyed()) {
      try {
        this.subTabWin.contentView.removeChildView(view);
      } catch {
        // may not be a child of sub-tab window
      }
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

  setTabBackgroundColor(tabId: TabId, color: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.setBackgroundColor(color);
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

  getNavigationEntry(tabId: TabId, offset: number): { url: string; title: string } | undefined {
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return undefined;
    const history = wc.navigationHistory;
    const idx = history.getActiveIndex() + offset;
    if (idx < 0 || idx >= history.length()) return undefined;
    return history.getEntryAtIndex(idx);
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
      try {
        const ok = globalShortcut.register(accelerator, callback);
        if (!ok) console.warn(`[shortcuts] Failed to register global shortcut: ${accelerator}`);
      } catch (err) {
        console.warn(`[shortcuts] Invalid accelerator: ${accelerator}`, err);
      }
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
    const template = Array.from(this.localShortcuts.entries())
      // Menu accelerators only support ASCII; non-ASCII keys (e.g. ½) still
      // work via before-input-event but can't be represented in the menu.
      .filter(([accelerator]) => /^[\x20-\x7e]+$/.test(accelerator))
      .map(([accelerator, click]) => ({
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

  // ── Context menu (native) ─────────────────────────────────────

  async showContextMenu(opts: {
    items: { label: string; icon?: string; disabled?: boolean }[];
    x: number;
    y: number;
  }): Promise<number> {
    const win = this.getWin();
    if (!win || win.isDestroyed()) return -1;

    this.hideTooltip();

    return new Promise<number>((resolve) => {
      let resolved = false;
      const template = opts.items.map((item, index) => ({
        label: item.label,
        enabled: !item.disabled,
        click: () => {
          resolved = true;
          resolve(index);
        },
      }));

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: win,
        x: Math.round(opts.x),
        y: Math.round(opts.y),
        callback: () => {
          if (!resolved) resolve(-1);
        },
      });
    });
  }

  // ── Sub-tab child window ─────────────────────────────────────

  private ensureSubTabWindow(): void {
    if (this.subTabWin && !this.subTabWin.isDestroyed()) return;
    if (process.env.NODE_ENV === "test") return;

    const parent = this.getWin();
    if (!parent) return;

    const rawCssDir = path
      .join(__dirname, "../../node_modules/@fortawesome/fontawesome-free/css")
      .replace(/\\/g, "/");
    const faCssDir = rawCssDir.startsWith("/") ? rawCssDir : `/${rawCssDir}`;

    this.subTabWin = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, "../preload/index.js"),
      },
    });

    const html = buildSubTabWindowHtml(faCssDir);
    const tmpPath = path.join(app.getPath("temp"), `chiaroscuro-subtab-win-${process.pid}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    this.subTabWin.loadFile(tmpPath);

    // Pass through all events until the sub-tab is actually shown
    this.subTabWin.setIgnoreMouseEvents(true, { forward: true });

    this.subTabWinReady = false;
    this.subTabWin.webContents.once("did-finish-load", () => {
      this.subTabWinReady = true;
      // Pre-show while backdrop is transparent to trigger OS window-show anim now
      if (this.subTabWin && !this.subTabWin.isDestroyed()) {
        this.subTabWin.showInactive();
      }
    });

    if (!this.subTabWinParentListenersSet) {
      parent.on("move", () => this.syncSubTabWinBounds());
      parent.on("resize", () => this.syncSubTabWinBounds());
      this.subTabWinParentListenersSet = true;
    }
  }

  private positionSubTabWin(contentBounds: Bounds): void {
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;

    this.subTabWinContentBounds = contentBounds;
    const cb = win.getContentBounds();
    this.subTabWin.setBounds({
      x: Math.round(cb.x + contentBounds.x),
      y: Math.round(cb.y + contentBounds.y),
      width: Math.round(contentBounds.width),
      height: Math.round(contentBounds.height),
    });
  }

  async showSubTabWindow(
    contentBounds: Bounds,
    frameBounds: Bounds,
    parentTabId: string,
  ): Promise<{ originX: number; originY: number }> {
    this.ensureSubTabWindow();

    // Click origin relative to the sub-tab frame (for CSS transform-origin)
    const cursor = screen.getCursorScreenPoint();
    const win = this.getWin();
    const cb = win && !win.isDestroyed() ? win.getContentBounds() : { x: 0, y: 0 };
    const originX = cursor.x - cb.x - frameBounds.x;
    const originY = cursor.y - cb.y - frameBounds.y;
    const origin = { originX, originY };

    if (!this.subTabWin || this.subTabWin.isDestroyed()) return origin;

    // Enable event capture on the child window (backdrop clicks, buttons)
    this.subTabWin.setIgnoreMouseEvents(false);
    this.positionSubTabWin(contentBounds);

    // Frame position relative to child window
    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;
    const fw = frameBounds.width;
    const fh = frameBounds.height;

    try {
      await this.subTabWin.webContents.executeJavaScript(
        `setParentTabId(${JSON.stringify(parentTabId)})`,
      );
      await this.subTabWin.webContents.executeJavaScript(`enterAnimation(${fx},${fy},${fw},${fh})`);
    } catch {
      // window may be destroyed
    }

    return origin;
  }

  async hideSubTabWindow(): Promise<void> {
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;

    try {
      await this.subTabWin.webContents.executeJavaScript("exitAnimation()");
    } catch {
      // window may be destroyed
    }
    // Pass through all events so the main window is usable
    this.subTabWin.setIgnoreMouseEvents(true, { forward: true });
    this.subTabWinContentBounds = null;
  }

  showSubTabWindowStatic(contentBounds: Bounds, frameBounds: Bounds, parentTabId: string): void {
    this.ensureSubTabWindow();
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;

    this.subTabWin.setIgnoreMouseEvents(false);
    this.positionSubTabWin(contentBounds);

    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;

    this.subTabWin.webContents
      .executeJavaScript(`setParentTabId(${JSON.stringify(parentTabId)})`)
      .catch(() => {});
    this.subTabWin.webContents
      .executeJavaScript(`showStatic(${fx},${fy},${frameBounds.width},${frameBounds.height})`)
      .catch(() => {});
  }

  hideSubTabWindowInstant(): void {
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;
    this.subTabWin.webContents.executeJavaScript("hide()").catch(() => {});
    this.subTabWin.setIgnoreMouseEvents(true, { forward: true });
    this.subTabWinContentBounds = null;
  }

  updateSubTabWindowBounds(contentBounds: Bounds, frameBounds: Bounds): void {
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;

    this.positionSubTabWin(contentBounds);

    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;
    this.subTabWin.webContents
      .executeJavaScript(`updateButtons(${fx},${fy},${frameBounds.width},${frameBounds.height})`)
      .catch(() => {});
  }

  attachTabToSubTabWindow(tabId: TabId, frameBounds: Bounds): void {
    const view = this.views.get(tabId);
    if (!view) return;
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;

    const mainWin = this.getWin();

    // Remove from main window if currently attached there
    if (mainWin && !mainWin.isDestroyed()) {
      try {
        mainWin.contentView.removeChildView(view);
      } catch {
        // may not be a child of main window
      }
    }

    // Add to child window (may already be there — addChildView is idempotent for existing children)
    try {
      this.subTabWin.contentView.addChildView(view);
    } catch {
      // already a child
    }

    view.setBounds({
      x: Math.round(frameBounds.x),
      y: Math.round(frameBounds.y),
      width: Math.round(frameBounds.width),
      height: Math.round(frameBounds.height),
    });
    view.setBorderRadius(8);
  }

  detachTabFromSubTabWindow(tabId: TabId): void {
    const view = this.views.get(tabId);
    if (!view) return;

    // Remove from child window
    if (this.subTabWin && !this.subTabWin.isDestroyed()) {
      try {
        this.subTabWin.contentView.removeChildView(view);
      } catch {
        // may not be a child
      }
    }

    // Add back to main window
    const mainWin = this.getWin();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.contentView.addChildView(view);
      // Hide until caller repositions
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  animateTabBounds(tabId: TabId, from: Bounds, to: Bounds, duration: number): Promise<void> {
    const view = this.views.get(tabId);
    if (!view) return Promise.resolve();

    // Cancel any existing animation on this tab
    this.tabBoundsAnimations.get(tabId)?.();

    return new Promise<void>((resolve) => {
      let cancelled = false;
      this.tabBoundsAnimations.set(tabId, () => {
        cancelled = true;
        resolve();
      });

      const startTime = performance.now();
      const tick = () => {
        if (cancelled) return;
        const t = Math.min((performance.now() - startTime) / duration, 1);
        const e = 1 - (1 - t) * (1 - t); // ease-out quadratic
        view.setBounds({
          x: Math.round(from.x + (to.x - from.x) * e),
          y: Math.round(from.y + (to.y - from.y) * e),
          width: Math.max(1, Math.round(from.width + (to.width - from.width) * e)),
          height: Math.max(1, Math.round(from.height + (to.height - from.height) * e)),
        });
        if (t < 1) {
          setTimeout(tick, 16);
        } else {
          this.tabBoundsAnimations.delete(tabId);
          resolve();
        }
      };
      tick();
    });
  }

  private syncSubTabWinBounds(): void {
    if (!this.subTabWinContentBounds) return;
    if (!this.subTabWin || this.subTabWin.isDestroyed()) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;
    const cb = win.getContentBounds();
    const ab = this.subTabWinContentBounds;
    this.subTabWin.setBounds({
      x: Math.round(cb.x + ab.x),
      y: Math.round(cb.y + ab.y),
      width: Math.round(ab.width),
      height: Math.round(ab.height),
    });
  }

  // ── Command palette overlay ──────────────────────────────────

  initCommandPaletteOverlay(windowId: WindowId): void {
    const parent = this.getWin(windowId);
    if (!parent) return;
    if (this.paletteWin && !this.paletteWin.isDestroyed()) return;

    // In test mode (headless CI), defer palette creation to first show.
    // Creating child BrowserWindows at startup crashes under --ozone-platform=headless.
    if (process.env.NODE_ENV === "test") return;

    this.createPaletteWindow(parent);

    // Show immediately as click-through overlay to avoid OS show/hide animations.
    // Visibility is controlled purely via CSS (the .open class).
    this.paletteWin?.webContents.on("did-finish-load", () => {
      if (!this.paletteWin || this.paletteWin.isDestroyed()) return;
      const bounds = this.paletteBounds();
      if (bounds) this.paletteWin.setBounds(bounds);
      this.paletteWin.setIgnoreMouseEvents(true);
      this.paletteWin.showInactive();
    });

    // Follow parent resize/move (register once to avoid accumulation)
    if (!this.paletteParentListenersSet) {
      parent.on("resize", () => this.syncPaletteBounds());
      parent.on("move", () => this.syncPaletteBounds());
      this.paletteParentListenersSet = true;
    }
  }

  private createPaletteWindow(parent: BrowserWindow): void {
    this.paletteWin = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      focusable: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, "../preload/index.js"),
      },
    });

    // Use PID-suffixed filename to avoid races when parallel workers write simultaneously
    const paletteTmpPath = path.join(
      app.getPath("temp"),
      `chiaroscuro-cmd-palette-${process.pid}.html`,
    );
    fs.writeFileSync(paletteTmpPath, COMMAND_PALETTE_HTML, "utf-8");
    this.paletteWin.loadFile(paletteTmpPath);
  }

  private paletteBounds(): Electron.Rectangle | null {
    const parent = this.getWin();
    if (!parent) return null;
    const b = parent.getContentBounds();
    // Shrink by 1px to counter Electron DPI-rounding overshoot
    return { x: b.x, y: b.y, width: b.width - 1, height: b.height - 1 };
  }

  private syncPaletteBounds(): void {
    if (!this.paletteWin || this.paletteWin.isDestroyed() || !this.paletteWin.isVisible()) return;
    const bounds = this.paletteBounds();
    if (!bounds) return;
    this.paletteWin.setBounds(bounds);
  }

  showCommandPalette(): void {
    // Lazy-create in test mode (deferred from initCommandPaletteOverlay)
    if (!this.paletteWin || this.paletteWin.isDestroyed()) {
      const parent = this.getWin();
      if (!parent) return;
      this.createPaletteWindow(parent);
      // Wait for HTML to load before interacting
      this.paletteWin?.webContents.on("did-finish-load", () => {
        this.revealPalette();
      });
      return;
    }

    this.revealPalette();
  }

  private revealPalette(): void {
    if (!this.paletteWin || this.paletteWin.isDestroyed()) return;
    const bounds = this.paletteBounds();
    if (!bounds) return;
    this.paletteWin.setBounds(bounds);
    if (!this.paletteWin.isVisible()) this.paletteWin.showInactive();
    this.paletteWin.setIgnoreMouseEvents(false);
    // Apply buffered provider config before resetting the palette
    if (this.pendingPaletteJs) {
      this.paletteWin.webContents.executeJavaScript(this.pendingPaletteJs).catch(() => {});
      this.pendingPaletteJs = null;
    }
    this.paletteWin.webContents.executeJavaScript("resetPalette()").catch(() => {});
    this.paletteWin.focus();
  }

  hideCommandPalette(): void {
    if (!this.paletteWin || this.paletteWin.isDestroyed()) return;
    // Animate out via CSS, then disable interaction
    this.paletteWin.webContents
      .executeJavaScript("document.getElementById('backdrop').classList.remove('open')")
      .catch(() => {});
    this.paletteWin.setIgnoreMouseEvents(true);
    // Refocus parent
    const win = this.getWin();
    if (win && !win.isDestroyed()) win.focus();
  }

  async updateCommandPalette(js: string): Promise<unknown> {
    if (!this.paletteWin || this.paletteWin.isDestroyed()) {
      // Buffer for lazy-created palette (test mode)
      this.pendingPaletteJs = js;
      return;
    }
    return this.paletteWin.webContents.executeJavaScript(js);
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

  // ── Find in page ───────────────────────────────────────────────

  findInPage(
    tabId: TabId,
    text: string,
    options?: { forward?: boolean; findNext?: boolean },
  ): void {
    const view = this.views.get(tabId);
    if (!view || view.webContents.isDestroyed()) return;
    view.webContents.findInPage(text, {
      forward: options?.forward ?? true,
      findNext: options?.findNext ?? false,
    });
  }

  stopFindInPage(tabId: TabId): void {
    const view = this.views.get(tabId);
    if (!view || view.webContents.isDestroyed()) return;
    view.webContents.stopFindInPage("clearSelection");
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

  // ── Network ─────────────────────────────────────────────────────

  async fetchAsDataUrl(url: string): Promise<string | undefined> {
    try {
      const res = await net.fetch(url);
      if (!res.ok) return undefined;
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/x-icon";
      return `data:${contentType};base64,${buf.toString("base64")}`;
    } catch {
      return undefined;
    }
  }

  // ── Protocol navigation ─────────────────────────────────────────

  onWindowOpen(
    callback: (url: string, sourceTabId: TabId, disposition: string) => boolean,
  ): () => void {
    this.windowOpenCallback = callback;
    return () => {
      if (this.windowOpenCallback === callback) {
        this.windowOpenCallback = undefined;
      }
    };
  }

  onProtocolRequest(callback: (url: string, origin: string) => void): () => void {
    this.protocolRequestCallback = callback;
    return () => {
      if (this.protocolRequestCallback === callback) {
        this.protocolRequestCallback = undefined;
      }
    };
  }

  // ── Shell / clipboard ───────────────────────────────────────────

  async openExternal(url: string): Promise<void> {
    if (!isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  }

  async openExternalApproved(url: string): Promise<void> {
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

  // ── Tab content actions ──────────────────────────────────────

  copyImageAt(tabId: TabId, x: number, y: number): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.webContents.copyImageAt(x, y);
  }

  downloadUrl(tabId: TabId, url: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.webContents.downloadURL(url);
  }

  async executeJavaScript(tabId: TabId, code: string): Promise<unknown> {
    const view = this.views.get(tabId);
    if (!view) return undefined;
    return view.webContents.executeJavaScript(code);
  }

  // ── Permissions ────────────────────────────────────────────────

  private findTabIdByWebContents(wc: Electron.WebContents): TabId | undefined {
    for (const [tabId, view] of this.views) {
      if (view.webContents === wc || view.webContents.id === wc.id) {
        return tabId;
      }
    }
    return undefined;
  }

  private installPermissionHandlers(ses: Electron.Session): void {
    // Present as standard Chrome so sites like Google don't block OAuth
    // flows due to detecting "Electron" in the user-agent string.
    const ua = ses.getUserAgent();
    ses.setUserAgent(ua.replace(/ Electron\/\S+/g, "").replace(/ \S+\/\S+(?= Chrome\/)/g, ""));

    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (!this.permissionRequestHandler) {
        callback(false);
        return;
      }
      const tabId = this.findTabIdByWebContents(wc);
      if (!tabId) {
        callback(false);
        return;
      }
      const d = details as {
        requestingUrl?: string;
        isMainFrame?: boolean;
        mediaTypes?: string[];
      };
      const requestingUrl = d.requestingUrl ?? wc.getURL();
      const isMainFrame = d.isMainFrame ?? true;
      const mediaTypes = d.mediaTypes;
      this.permissionRequestHandler(tabId, permission, {
        requestingUrl,
        isMainFrame,
        mediaTypes,
      })
        .then((allowed) => callback(allowed))
        .catch(() => callback(false));
    });

    ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
      if (!this.permissionCheckHandler) return false;
      if (!wc) return false;
      const tabId = this.findTabIdByWebContents(wc);
      if (!tabId) return false;
      const mediaType = (details as { mediaType?: string })?.mediaType;
      return this.permissionCheckHandler(tabId, permission, requestingOrigin, { mediaType });
    });
  }

  private installDevicePermissionHandlers(ses: Electron.Session): void {
    // Device permission check — allows access to previously-selected devices
    ses.setDevicePermissionHandler((details) => {
      const origin = (details as { origin?: string }).origin;
      if (!origin) return false;
      const granted = this.grantedDevices.get(origin);
      if (!granted) return false;
      const deviceType = (details as { deviceType?: string }).deviceType;
      return granted.some((g) => g.deviceType === deviceType);
    });

    // Device selection events — show native picker dialogs
    const handleDeviceSelection = (
      type: string,
      listKey: string,
      ev: Electron.Event,
      details: Record<string, unknown>,
      callback: (id: string) => void,
    ) => {
      ev.preventDefault();
      const devices = (details[listKey] ?? []) as Array<Record<string, unknown>>;
      const origin = ((details.frame as { origin?: string })?.origin ??
        (details.frame as { url?: string })?.url) as string | undefined;

      if (!devices.length || !origin) {
        callback("");
        return;
      }

      this.showDeviceSelectionPrompt(origin, type, devices)
        .then((selectedId) => {
          if (selectedId) {
            const list = this.grantedDevices.get(origin) ?? [];
            const device = devices.find(
              (d) => d.deviceId === selectedId || d.portId === selectedId,
            );
            list.push({ deviceType: type, device });
            this.grantedDevices.set(origin, list);
            this.deviceSelectedCallback?.(type, origin);
          }
          callback(selectedId ?? "");
        })
        .catch(() => callback(""));
    };

    // biome-ignore lint/suspicious/noExplicitAny: Electron session device events have varying signatures
    const s = ses as any;
    s.on(
      "select-usb-device",
      (ev: Electron.Event, d: Record<string, unknown>, cb: (id: string) => void) =>
        handleDeviceSelection("usb", "deviceList", ev, d, cb),
    );
    s.on(
      "select-hid-device",
      (ev: Electron.Event, d: Record<string, unknown>, cb: (id: string) => void) =>
        handleDeviceSelection("hid", "deviceList", ev, d, cb),
    );
    s.on(
      "select-serial-port",
      (ev: Electron.Event, d: Record<string, unknown>, cb: (id: string) => void) =>
        handleDeviceSelection("serial", "portList", ev, d, cb),
    );
    s.on(
      "select-bluetooth-device",
      (ev: Electron.Event, d: Record<string, unknown>, cb: (id: string) => void) =>
        handleDeviceSelection("bluetooth", "deviceList", ev, d, cb),
    );
  }

  private async showDeviceSelectionPrompt(
    origin: string,
    deviceType: string,
    devices: Array<Record<string, unknown>>,
  ): Promise<string | null> {
    let domain: string;
    try {
      domain = new URL(origin).hostname;
    } catch {
      domain = origin;
    }

    const typeLabels: Record<string, string> = {
      usb: "USB device",
      hid: "HID device",
      serial: "serial port",
      bluetooth: "Bluetooth device",
    };
    const typeLabel = typeLabels[deviceType] ?? "device";

    // Build button labels from device names
    const labels = devices.map((d, i) => {
      const name =
        (d.productName as string) ??
        (d.deviceName as string) ??
        (d.displayName as string) ??
        `${typeLabel} ${i + 1}`;
      return name;
    });

    const opts: Electron.MessageBoxOptions = {
      type: "question",
      title: `Select ${typeLabel}`,
      message: `${domain} wants to connect to a ${typeLabel}`,
      buttons: ["Cancel", ...labels],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };

    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    const result = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);

    if (result.response === 0) return null; // Cancel
    const selected = devices[result.response - 1];
    return ((selected?.deviceId ?? selected?.portId) as string) ?? null;
  }

  onPermissionRequest(
    handler: (
      tabId: TabId,
      permission: string,
      details: { requestingUrl: string; isMainFrame: boolean; mediaTypes?: string[] },
    ) => Promise<boolean>,
  ): void {
    this.permissionRequestHandler = handler;
  }

  onPermissionCheck(
    handler: (
      tabId: TabId,
      permission: string,
      requestingOrigin: string,
      details: { mediaType?: string },
    ) => boolean,
  ): void {
    this.permissionCheckHandler = handler;
  }

  onDeviceSelected(callback: (deviceType: string, origin: string) => void): void {
    this.deviceSelectedCallback = callback;
  }

  clearDevicePermissions(origin: string, deviceType?: string): void {
    // origin is a domain name — match against stored origins
    for (const [storedOrigin, devices] of this.grantedDevices) {
      let matchesDomain = false;
      try {
        matchesDomain = new URL(storedOrigin).hostname === origin;
      } catch {
        matchesDomain = storedOrigin === origin;
      }
      if (!matchesDomain) continue;

      if (deviceType) {
        const filtered = devices.filter((d) => d.deviceType !== deviceType);
        if (filtered.length === 0) this.grantedDevices.delete(storedOrigin);
        else this.grantedDevices.set(storedOrigin, filtered);
      } else {
        this.grantedDevices.delete(storedOrigin);
      }
    }
  }

  async showPermissionPrompt(domain: string, permissionLabel: string): Promise<boolean> {
    const opts: Electron.MessageBoxOptions = {
      type: "question",
      title: "Permission Request",
      message: `${domain} wants to access ${permissionLabel}`,
      buttons: ["Deny", "Allow"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    const result = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    return result.response === 1;
  }
}

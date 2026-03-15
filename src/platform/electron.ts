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

// HTML for the sub-tab action buttons overlay (close + promote)
// Generated at init time to inject the resolved FA webfont path
function buildSubTabButtonsHtml(faCssDir: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${faCssDir}/fontawesome.css">
<link rel="stylesheet" href="file://${faCssDir}/solid.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}html,body{background:transparent;overflow:hidden}
body{display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;height:100vh;padding:24px}
button{width:48px;height:48px;border-radius:50%;border:none;background:white;
color:oklch(0.35 0 0);font-size:1.125rem;
box-shadow:0 4px 20px oklch(0 0 0 / 0.25),0 1px 3px oklch(0 0 0 / 0.15);
cursor:pointer;display:flex;align-items:center;justify-content:center;
transition:transform 200ms cubic-bezier(0.34,1.56,0.64,1);-webkit-font-smoothing:antialiased}
button:hover{transform:scale(1.15)}button:active{transform:scale(0.95)}
</style></head><body>
<button id="c" aria-label="Close sub-tab"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
<button id="p" aria-label="Open as tab"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
<script>
let pid=null;
function setParentTabId(id){pid=id}
document.getElementById('c').onclick=()=>{if(pid)window.chiaroscuro.sendCommand('sub-tabs:close',{parentTabId:pid})};
document.getElementById('p').onclick=()=>{if(pid)window.chiaroscuro.sendCommand('sub-tabs:promote',{parentTabId:pid})};
</script></body></html>`;
}

// HTML for the sub-tab backdrop overlay — canvas-based with transparent hole at frame.
// Uses setIgnoreMouseEvents(true, {forward:true}) so clicks on the transparent hole
// pass through to the sub-tab WCV underneath, while clicks on the dark backdrop
// are caught and trigger sub-tabs:close.
const SUB_TAB_ANIMATION_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{background:transparent;overflow:hidden;width:100%;height:100%}
canvas{position:fixed;inset:0;cursor:default}
</style></head><body><canvas id="c"></canvas>
<script>
var c=document.getElementById('c'),ctx=c.getContext('2d');
var pid=null,frame=null,opacity=0,animId=null,D=200,R=8;
var inHole=true;
function resize(){c.width=window.innerWidth;c.height=window.innerHeight;draw()}
function draw(){
  ctx.clearRect(0,0,c.width,c.height);
  if(opacity<=0)return;
  if(frame){
    ctx.save();ctx.shadowColor='rgba(0,0,0,'+0.5*opacity+')';ctx.shadowBlur=24;ctx.shadowOffsetY=6;
    ctx.fillStyle='rgba(0,0,0,1)';rr(ctx,frame.x,frame.y,frame.w,frame.h,R);ctx.fill();ctx.restore();
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,1)';
    rr(ctx,frame.x,frame.y,frame.w,frame.h,R);ctx.fill();ctx.restore();
  }
  ctx.save();ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='rgba(0,0,0,'+0.5*opacity+')';
  rr(ctx,0,0,c.width,c.height,R);ctx.clip();ctx.fillRect(0,0,c.width,c.height);ctx.restore();
  if(frame){
    ctx.save();ctx.globalCompositeOperation='destination-out';
    ctx.fillStyle='rgba(0,0,0,1)';
    rr(ctx,frame.x,frame.y,frame.w,frame.h,R);
    ctx.fill();ctx.restore();
  }
}
function rr(c,x,y,w,h,r){
  c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}
function setParentTabId(id){pid=id}
function setFrame(x,y,w,h){frame={x:x,y:y,w:w,h:h};draw()}
function showStatic(x,y,w,h){opacity=1;frame={x:x,y:y,w:w,h:h};inHole=true;draw()}
function cancelAnim(){if(animId){cancelAnimationFrame(animId);animId=null}}
function enterAnimation(fx,fy,fw,fh,ox,oy){
  return new Promise(function(resolve){
    cancelAnim();inHole=true;
    frame={x:fx,y:fy,w:fw,h:fh};
    var start=performance.now();
    function tick(now){
      var t=Math.min((now-start)/D,1);
      var e=1-(1-t)*(1-t);
      opacity=e;
      draw();
      if(t<1){animId=requestAnimationFrame(tick)}else{animId=null;resolve()}
    }
    animId=requestAnimationFrame(tick);
  });
}
function exitAnimation(){
  return new Promise(function(resolve){
    cancelAnim();var start=performance.now();
    if(!frame){resolve();return}
    function tick(now){
      var t=Math.min((now-start)/D,1);
      var e=t*t;
      opacity=1-e;
      draw();
      if(t<1){animId=requestAnimationFrame(tick)}else{animId=null;opacity=0;frame=null;inHole=true;draw();resolve()}
    }
    animId=requestAnimationFrame(tick);
  });
}
function hide(){cancelAnim();opacity=0;frame=null;inHole=true;draw()}
function ptInHole(x,y){
  if(!frame)return false;
  return x>=frame.x&&x<=frame.x+frame.w&&y>=frame.y&&y<=frame.y+frame.h;
}
window.addEventListener('resize',resize);resize();
c.addEventListener('mousemove',function(e){
  if(opacity<=0)return;
  var h=ptInHole(e.clientX,e.clientY);
  if(h!==inHole){inHole=h;window.chiaroscuro.sendCommand('sub-tabs:overlay-passthrough',{passthrough:h}).catch(function(){});}
});
c.addEventListener('mouseleave',function(){
  if(opacity<=0)return;
  if(!inHole){inHole=true;window.chiaroscuro.sendCommand('sub-tabs:overlay-passthrough',{passthrough:true}).catch(function(){});}
});
c.addEventListener('click',function(){
  if(pid)window.chiaroscuro.sendCommand('sub-tabs:close',{parentTabId:pid});
});
</script></body></html>`;

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
  if(/^https?:\\/\\//i.test(v))return{type:'url',url:v};
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
  private paletteWin: BrowserWindow | null = null;
  private ctxResolve: ((index: number) => void) | null = null;
  private ctxParentListenersSet = false;
  private paletteParentListenersSet = false;
  private subTabBtnsWin: BrowserWindow | null = null;
  private subTabBtnsParentListenersSet = false;
  private subTabBtnsLastBounds: Bounds | null = null;
  private subTabAnimWin: BrowserWindow | null = null;
  private subTabAnimParentListenersSet = false;
  private subTabAnimContentBounds: Bounds | null = null;
  private pendingPaletteJs: string | null = null;
  private permissionHandlerSet = false;
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

  async createTab(windowId: WindowId, url: string, existingTabId?: TabId): Promise<TabId> {
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

    if (!this.permissionHandlerSet) {
      const ses = view.webContents.session;
      ses.setPermissionRequestHandler((_wc, _permission, callback) => {
        callback(false);
      });
      ses.setPermissionCheckHandler(() => false);
      this.permissionHandlerSet = true;
    }

    view.webContents.setWindowOpenHandler(({ url, disposition }) => {
      if (isAllowedUrl(url)) {
        // Let registered callback handle it (sub-tabs, etc.)
        if (this.windowOpenCallback?.(url, tabId, disposition)) {
          return { action: "deny" as const };
        }
        // Fallback: navigate the current tab
        view.webContents.loadURL(url);
      } else if (this.protocolRequestCallback) {
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

  // ── Sub-tab buttons overlay ──────────────────────────────────

  initSubTabButtonsOverlay(windowId: WindowId): void {
    const parent = this.getWin(windowId);
    if (!parent) return;
    if (this.subTabBtnsWin && !this.subTabBtnsWin.isDestroyed()) return;

    // In test mode, defer to avoid crashes under --ozone-platform=headless
    if (process.env.NODE_ENV === "test") return;

    const rawCssDir = path
      .join(__dirname, "../../node_modules/@fortawesome/fontawesome-free/css")
      .replace(/\\/g, "/");
    const faCssDir = rawCssDir.startsWith("/") ? rawCssDir : `/${rawCssDir}`;

    this.subTabBtnsWin = new BrowserWindow({
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

    const html = buildSubTabButtonsHtml(faCssDir);
    const tmpPath = path.join(app.getPath("temp"), `chiaroscuro-subtab-btns-${process.pid}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    this.subTabBtnsWin.loadFile(tmpPath);

    if (!this.subTabBtnsParentListenersSet) {
      parent.on("move", () => this.syncSubTabButtonsBounds());
      parent.on("resize", () => this.syncSubTabButtonsBounds());
      this.subTabBtnsParentListenersSet = true;
    }
  }

  showSubTabButtons(frameBounds: Bounds, parentTabId: string): void {
    this.subTabBtnsLastBounds = frameBounds;

    if (!this.subTabBtnsWin || this.subTabBtnsWin.isDestroyed()) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;

    const cb = win.getContentBounds();
    const pad = 24; // padding for box-shadow overflow
    const gap = 12; // gap between frame and buttons
    const btnW = 48;
    const btnH = 108; // 48 + 12 + 48

    const x = cb.x + frameBounds.x + frameBounds.width + gap - pad;
    const y = cb.y + frameBounds.y + (frameBounds.height - btnH) / 2 - pad;

    this.subTabBtnsWin.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: btnW + 2 * pad,
      height: btnH + 2 * pad,
    });

    this.subTabBtnsWin.webContents
      .executeJavaScript(`setParentTabId(${JSON.stringify(parentTabId)})`)
      .catch(() => {});

    if (!this.subTabBtnsWin.isVisible()) {
      this.subTabBtnsWin.showInactive();
    }
  }

  hideSubTabButtons(): void {
    this.subTabBtnsLastBounds = null;
    if (this.subTabBtnsWin && !this.subTabBtnsWin.isDestroyed() && this.subTabBtnsWin.isVisible()) {
      this.subTabBtnsWin.hide();
    }
  }

  private syncSubTabButtonsBounds(): void {
    if (!this.subTabBtnsLastBounds) return;
    if (!this.subTabBtnsWin || this.subTabBtnsWin.isDestroyed() || !this.subTabBtnsWin.isVisible())
      return;
    // Re-apply with stored bounds (parent moved, so screen coords changed)
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;
    const cb = win.getContentBounds();
    const pad = 24;
    const gap = 12;
    const btnW = 48;
    const btnH = 108;
    const fb = this.subTabBtnsLastBounds;

    this.subTabBtnsWin.setBounds({
      x: Math.round(cb.x + fb.x + fb.width + gap - pad),
      y: Math.round(cb.y + fb.y + (fb.height - btnH) / 2 - pad),
      width: btnW + 2 * pad,
      height: btnH + 2 * pad,
    });
  }

  // ── Sub-tab animation overlay ─────────────────────────────────

  initSubTabAnimationOverlay(windowId: WindowId): void {
    const parent = this.getWin(windowId);
    if (!parent) return;
    if (this.subTabAnimWin && !this.subTabAnimWin.isDestroyed()) return;
    if (process.env.NODE_ENV === "test") return;

    this.subTabAnimWin = new BrowserWindow({
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

    // Transparent pixels (the frame hole) pass events to the sub-tab WCV;
    // non-transparent pixels (the dark backdrop) are caught for click-to-dismiss.
    this.subTabAnimWin.setIgnoreMouseEvents(true, { forward: true });

    const tmpPath = path.join(app.getPath("temp"), `chiaroscuro-subtab-anim-${process.pid}.html`);
    fs.writeFileSync(tmpPath, SUB_TAB_ANIMATION_HTML, "utf-8");
    this.subTabAnimWin.loadFile(tmpPath);

    // Pre-show the window while the canvas is empty (transparent). This triggers
    // the OS window-show animation now, when nothing is visible, so that later
    // enterAnimation calls don't get an unwanted OS-level size animation.
    this.subTabAnimWin.webContents.once("did-finish-load", () => {
      if (this.subTabAnimWin && !this.subTabAnimWin.isDestroyed()) {
        this.subTabAnimWin.showInactive();
      }
    });

    if (!this.subTabAnimParentListenersSet) {
      parent.on("move", () => this.syncSubTabAnimBounds());
      parent.on("resize", () => this.syncSubTabAnimBounds());
      this.subTabAnimParentListenersSet = true;
    }
  }

  async playSubTabEnterAnimation(
    contentBounds: Bounds,
    frameBounds: Bounds,
    parentTabId: string,
  ): Promise<{ originX: number; originY: number }> {
    // Click origin relative to the sub-tab frame (for CSS transform-origin)
    const cursor = screen.getCursorScreenPoint();
    const win = this.getWin();
    const cb = win && !win.isDestroyed() ? win.getContentBounds() : { x: 0, y: 0 };
    const originX = cursor.x - cb.x - frameBounds.x;
    const originY = cursor.y - cb.y - frameBounds.y;
    const origin = { originX, originY };

    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return origin;
    if (!win || win.isDestroyed()) return origin;

    this.subTabAnimContentBounds = contentBounds;
    // Width -1 to avoid 1px bleed past content area right edge
    this.subTabAnimWin.setBounds({
      x: Math.round(cb.x + contentBounds.x),
      y: Math.round(cb.y + contentBounds.y),
      width: Math.round(contentBounds.width) - 1,
      height: Math.round(contentBounds.height),
    });

    // Frame position relative to overlay
    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;
    const fw = frameBounds.width;
    const fh = frameBounds.height;

    // Window is pre-shown during init — no showInactive() needed here,
    // which avoids the OS window-show animation that caused unwanted size anim.

    try {
      await this.subTabAnimWin.webContents.executeJavaScript(
        `setParentTabId(${JSON.stringify(parentTabId)})`,
      );
      await this.subTabAnimWin.webContents.executeJavaScript(
        `enterAnimation(${fx},${fy},${fw},${fh},${originX},${originY})`,
      );
    } catch {
      // overlay may be destroyed
    }
    // Keep overlay visible — it serves as the persistent clickable backdrop
    return origin;
  }

  async playSubTabExitAnimation(): Promise<void> {
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return;
    if (!this.subTabAnimContentBounds) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;

    const contentBounds = this.subTabAnimContentBounds;
    const cb = win.getContentBounds();
    this.subTabAnimWin.setBounds({
      x: Math.round(cb.x + contentBounds.x),
      y: Math.round(cb.y + contentBounds.y),
      width: Math.round(contentBounds.width) - 1,
      height: Math.round(contentBounds.height),
    });

    try {
      await this.subTabAnimWin.webContents.executeJavaScript("exitAnimation()");
    } catch {
      // overlay may be destroyed
    }
    // Don't hide() — window stays visible but transparent (canvas cleared by
    // exitAnimation). This avoids OS window-show animation on the next enter.
    if (this.subTabAnimWin && !this.subTabAnimWin.isDestroyed()) {
      this.subTabAnimWin.setIgnoreMouseEvents(true, { forward: true });
    }
    this.subTabAnimContentBounds = null;
  }

  showSubTabOverlay(contentBounds: Bounds, frameBounds: Bounds, parentTabId: string): void {
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;

    this.subTabAnimContentBounds = contentBounds;
    const cb = win.getContentBounds();
    this.subTabAnimWin.setBounds({
      x: Math.round(cb.x + contentBounds.x),
      y: Math.round(cb.y + contentBounds.y),
      width: Math.round(contentBounds.width) - 1,
      height: Math.round(contentBounds.height),
    });

    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;

    this.subTabAnimWin.webContents
      .executeJavaScript(`setParentTabId(${JSON.stringify(parentTabId)})`)
      .catch(() => {});
    this.subTabAnimWin.webContents
      .executeJavaScript(`showStatic(${fx},${fy},${frameBounds.width},${frameBounds.height})`)
      .catch(() => {});
    // Window is pre-shown during init — no showInactive() needed
  }

  hideSubTabOverlay(): void {
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return;
    this.subTabAnimWin.webContents.executeJavaScript("hide()").catch(() => {});
    // Don't hide() — window stays visible but transparent
    this.subTabAnimWin.setIgnoreMouseEvents(true, { forward: true });
    this.subTabAnimContentBounds = null;
  }

  updateSubTabOverlayFrame(contentBounds: Bounds, frameBounds: Bounds): void {
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return;
    if (!this.subTabAnimWin.isVisible()) return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;

    this.subTabAnimContentBounds = contentBounds;
    const cb = win.getContentBounds();
    this.subTabAnimWin.setBounds({
      x: Math.round(cb.x + contentBounds.x),
      y: Math.round(cb.y + contentBounds.y),
      width: Math.round(contentBounds.width) - 1,
      height: Math.round(contentBounds.height),
    });

    const fx = frameBounds.x - contentBounds.x;
    const fy = frameBounds.y - contentBounds.y;
    this.subTabAnimWin.webContents
      .executeJavaScript(`setFrame(${fx},${fy},${frameBounds.width},${frameBounds.height})`)
      .catch(() => {});
  }

  private syncSubTabAnimBounds(): void {
    if (!this.subTabAnimContentBounds) return;
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed() || !this.subTabAnimWin.isVisible())
      return;
    const win = this.getWin();
    if (!win || win.isDestroyed()) return;
    const cb = win.getContentBounds();
    const ab = this.subTabAnimContentBounds;
    this.subTabAnimWin.setBounds({
      x: Math.round(cb.x + ab.x),
      y: Math.round(cb.y + ab.y),
      width: Math.round(ab.width) - 1,
      height: Math.round(ab.height),
    });
  }

  setSubTabOverlayPassthrough(passthrough: boolean): void {
    if (!this.subTabAnimWin || this.subTabAnimWin.isDestroyed()) return;
    if (passthrough) {
      this.subTabAnimWin.setIgnoreMouseEvents(true, { forward: true });
    } else {
      this.subTabAnimWin.setIgnoreMouseEvents(false);
    }
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
}

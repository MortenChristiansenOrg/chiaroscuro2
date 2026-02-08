import { type ReactNode, useCallback, useEffect, useState } from "react";
import "./design-mockups.css";

/* ═══════════════════════════════════════
   SVG Icons (inline, no external deps)
   ═══════════════════════════════════════ */
const S = {
  width: 10,
  height: 10,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true,
} as const;
const IcoCopy = () => (
  <svg {...S} viewBox="0 0 12 12" width={11} height={11} strokeWidth={1}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <path d="M8.5,3.5V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5.5a1 1 0 001 1h1.5" />
  </svg>
);
const IcoMin = () => (
  <svg {...S} viewBox="0 0 10 1">
    <rect width="10" height="1" fill="currentColor" stroke="none" />
  </svg>
);
const IcoMax = () => (
  <svg {...S} viewBox="0 0 10 10" strokeWidth={1}>
    <rect x="0.5" y="0.5" width="9" height="9" />
  </svg>
);
const IcoX = () => (
  <svg {...S} viewBox="0 0 10 10" strokeWidth={1.2}>
    <line x1="0" y1="0" x2="10" y2="10" />
    <line x1="10" y1="0" x2="0" y2="10" />
  </svg>
);
const IcoChevDown = () => (
  <svg {...S} viewBox="0 0 10 10" width={10} height={10} strokeWidth={1.5}>
    <polyline points="2,3.5 5,6.5 8,3.5" />
  </svg>
);
const IcoChevRight = () => (
  <svg {...S} viewBox="0 0 10 10" width={9} height={9} strokeWidth={1.5}>
    <polyline points="3.5,2 6.5,5 3.5,8" />
  </svg>
);
const IcoFolder = ({ size = 12 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
  </svg>
);
const IcoFolderOpen = ({ size = 12 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 14l1.5-2.9A2 2 0 019.24 10H20a2 2 0 011.94 2.5l-1.54 6a2 2 0 01-1.95 1.5H4a2 2 0 01-2-2V5a2 2 0 012-2h3.9a2 2 0 011.69.9l.81 1.2a2 2 0 001.67.9H18a2 2 0 012 2v2" />
  </svg>
);
const IcoLock = () => (
  <svg
    aria-hidden
    width={9}
    height={9}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ display: "inline-block", verticalAlign: -1, marginRight: 5, opacity: 0.5 }}
  >
    <rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);
const IcoPencil = () => (
  <svg
    aria-hidden
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
const IcoPlus = () => (
  <svg
    aria-hidden
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IcoBroom = () => (
  <svg
    aria-hidden
    width={10}
    height={10}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.3}
    strokeLinecap="round"
  >
    <line x1="13" y1="3" x2="8" y2="8" />
    <line x1="8" y1="8" x2="3" y2="13" />
    <line x1="8" y1="8" x2="2.5" y2="11" />
    <line x1="8" y1="8" x2="5" y2="13.5" />
  </svg>
);
const IcoBack = () => (
  <svg {...S} viewBox="0 0 10 10" strokeWidth={1.5}>
    <polyline points="6.5,2 3.5,5 6.5,8" />
  </svg>
);
const IcoForward = () => (
  <svg {...S} viewBox="0 0 10 10" strokeWidth={1.5}>
    <polyline points="3.5,2 6.5,5 3.5,8" />
  </svg>
);
const IcoRefresh = () => (
  <svg
    aria-hidden
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

/* ═══════════════════════════════════════
   Shared: Window Controls
   ═══════════════════════════════════════ */
const drag = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

function WC({ hideCopy }: { hideCopy?: boolean } = {}) {
  const send = (cmd: string) => window.chiaroscuro.sendCommand(cmd, undefined);
  return (
    <div className="wc" style={noDrag}>
      {!hideCopy && (
        <button type="button" data-tip="Copy" onClick={() => send("window:copy-address")}>
          <IcoCopy />
        </button>
      )}
      <button type="button" data-tip="Minimize" onClick={() => send("window:minimize")}>
        <IcoMin />
      </button>
      <button type="button" data-tip="Maximize" onClick={() => send("window:maximize-restore")}>
        <IcoMax />
      </button>
      <button type="button" className="close" data-tip="Close" onClick={() => send("window:close")}>
        <IcoX />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   Shared: Mock Page Content
   ═══════════════════════════════════════ */
function MockPage() {
  return (
    <div className="page-content">
      <div className="page-inner">
        <nav className="page-nav">
          <span className="page-title">Gallery</span>
          <div className="page-links">
            <span className="active">Works</span>
            <span>About</span>
          </div>
        </nav>
        <div className="page-hero">
          <h1>
            A curated space
            <br />
            <em>for visual art</em>
          </h1>
          <p className="hero-desc">
            Step through the collections below to explore works organized by theme, medium, and
            inspiration. Each gallery offers a different perspective on the creative journey.
          </p>
        </div>
        <div className="page-section-label">Collections</div>
        <div className="page-cards">
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Light &amp; Shadow</h3>
              <p>Exploring the interplay of illumination and darkness across mediums.</p>
            </div>
          </div>
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Earth Tones</h3>
              <p>Natural palettes drawn from landscapes, minerals, and organic forms.</p>
            </div>
          </div>
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Geometric</h3>
              <p>The beauty of mathematical precision in contemporary visual art.</p>
            </div>
          </div>
        </div>
        <div className="page-footer">&copy; 2026 Gallery — A curated collection of visual art</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DESIGNS 1–10
   ═══════════════════════════════════════ */

function D1() {
  return (
    <div id="d1" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-btn c1 active" />
            <button type="button" className="ws-btn c2" />
            <button type="button" className="ws-btn c3" />
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <div className="dot fav-gm" />
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="dot fav-cal" />
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="dot fav-sl" />
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Tabs</div>
          <div className="tab active">
            <div className="dot fav-gh" />
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="dot fav-fig" />
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-label">
            <IcoChevDown />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="dot fav-doc" />
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="dot fav-not" />
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="dot fav-lin" />
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <div className="dot fav-red" />
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="dot fav-wk" />
              <span className="t">Wikipedia — Chiaroscuro</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function StandardSidebar({ children, ws }: { children?: ReactNode; ws: ReactNode }) {
  return (
    <div className="sidebar">
      {ws}
      <div className="lbl">Pinned</div>
      <div className="tab">
        <div className="fav fav-gm">G</div>
        <span className="t">Gmail</span>
      </div>
      <div className="tab">
        <div className="fav fav-cal">C</div>
        <span className="t">Calendar</span>
      </div>
      <div className="tab">
        <div className="fav fav-sl">S</div>
        <span className="t">Slack</span>
      </div>
      <div className="sep" />
      <div className="lbl">Bookmarked</div>
      <div className="tab active">
        <div className="fav fav-gh">G</div>
        <span className="t">GitHub — chiaroscuro2</span>
      </div>
      <div className="tab">
        <div className="fav fav-fig">F</div>
        <span className="t">Figma — UI Kit</span>
      </div>
      {children}
      <div className="tab">
        <div className="fav fav-lin">L</div>
        <span className="t">Linear — Sprint Board</span>
      </div>
      <div className="eph-section">
        <div className="sep" />
        <div className="lbl">Ephemeral</div>
        <div className="tab">
          <div className="fav fav-red">R</div>
          <span className="t">Reddit — r/webdev</span>
        </div>
        <div className="tab">
          <div className="fav fav-wk">W</div>
          <span className="t">Wikipedia — Chiaroscuro</span>
        </div>
      </div>
    </div>
  );
}

function D2() {
  return (
    <div id="d2" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
      </div>
      <div className="panels">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-dot c1 active" />
            <button type="button" className="ws-dot c2" />
            <button type="button" className="ws-dot c3" />
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <div className="fav fav-gm">G</div>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="fav fav-cal">C</div>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="fav fav-sl">S</div>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <div className="fav fav-gh">G</div>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="fav fav-fig">F</div>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoChevDown />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="fav fav-lin">L</div>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <div className="fav fav-red">R</div>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="fav fav-wk">W</div>
              <span className="t">Wikipedia — Chiaroscuro</span>
            </div>
          </div>
        </div>
        <div className="content-panel">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D3() {
  return (
    <div id="d3" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-tag active">
              work
            </button>
            <button type="button" className="ws-tag">
              personal
            </button>
            <button type="button" className="ws-tag">
              side
            </button>
          </div>
          <div className="lbl">pinned</div>
          <div className="tab">
            <div className="fav fav-gm">G</div>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="fav fav-cal">C</div>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="fav fav-sl">S</div>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">bookmarked</div>
          <div className="tab active">
            <div className="fav fav-gh">G</div>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="fav fav-fig">F</div>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoChevRight />
            research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="fav fav-lin">L</div>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">ephemeral</div>
            <div className="tab">
              <div className="fav fav-red">R</div>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="fav fav-wk">W</div>
              <span className="t">Wikipedia</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D4() {
  return (
    <div id="d4" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
      </div>
      <div className="panels">
        <StandardSidebar
          ws={
            <div className="ws-row">
              <button type="button" className="ws-pill active">
                Work
              </button>
              <button type="button" className="ws-pill">
                Personal
              </button>
              <button type="button" className="ws-pill">
                Side
              </button>
            </div>
          }
        >
          <div className="folder">
            <div className="folder-hd">Research</div>
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
        </StandardSidebar>
        <div className="content-panel">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D5() {
  const RF = ({ c, children }: { c: string; children: string }) => (
    <div className={`fav ${c}`} style={{ borderRadius: "50%" }}>
      {children}
    </div>
  );
  return (
    <div id="d5" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-bubble c1 active">
              W
            </button>
            <button type="button" className="ws-bubble c2">
              P
            </button>
            <button type="button" className="ws-bubble c3">
              S
            </button>
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <RF c="fav-gm">G</RF>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <RF c="fav-cal">C</RF>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <RF c="fav-sl">S</RF>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <RF c="fav-gh">G</RF>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <RF c="fav-fig">F</RF>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoFolder />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <RF c="fav-doc">D</RF>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <RF c="fav-not">N</RF>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <RF c="fav-lin">L</RF>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <RF c="fav-red">R</RF>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <RF c="fav-wk">W</RF>
              <span className="t">Wikipedia — Chiaroscuro</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D6() {
  return (
    <div id="d6" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-dot c1 active" />
            <button type="button" className="ws-dot c2" />
            <button type="button" className="ws-dot c3" />
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <div className="fav fav-gm">G</div>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="fav fav-cal">C</div>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="fav fav-sl">S</div>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <div className="fav fav-gh">G</div>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="fav fav-fig">F</div>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoChevDown />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="fav fav-lin">L</div>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <div className="fav fav-red">R</div>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="fav fav-wk">W</div>
              <span className="t">Wikipedia — Chiaroscuro</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D7() {
  const R = ({ style, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
      className="fav"
      style={{
        borderRadius: 2,
        border: "1px solid oklch(0.7 0 0 / 0.15)",
        background: "transparent",
        color: "oklch(0.45 0 0)",
        fontSize: 7,
        ...style,
      }}
      {...p}
    />
  );
  return (
    <div id="d7" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-circ active">
              W
            </button>
            <button type="button" className="ws-circ">
              P
            </button>
            <button type="button" className="ws-circ">
              S
            </button>
          </div>
          <div className="lbl">pinned</div>
          <div className="tab">
            <R>Gm</R>
            <span className="t">gmail</span>
          </div>
          <div className="tab">
            <R>Ca</R>
            <span className="t">calendar</span>
          </div>
          <div className="tab">
            <R>Sl</R>
            <span className="t">slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">bookmarked</div>
          <div className="tab active">
            <R>Gh</R>
            <span className="t">github — chiaroscuro2</span>
          </div>
          <div className="tab">
            <R>Fi</R>
            <span className="t">figma — ui kit</span>
          </div>
          <div className="folder-group">
            <div className="folder-hd">
              <IcoFolder size={10} />
              research
            </div>
            <div className="tab">
              <R>El</R>
              <span className="t">electron docs</span>
            </div>
            <div className="tab">
              <R>No</R>
              <span className="t">notion — notes</span>
            </div>
          </div>
          <div className="tab">
            <R>Li</R>
            <span className="t">linear — sprint board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">ephemeral</div>
            <div className="tab">
              <R>Re</R>
              <span className="t">reddit — r/webdev</span>
            </div>
            <div className="tab">
              <R>Wi</R>
              <span className="t">wikipedia</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D8() {
  const RF = ({ c, children }: { c: string; children: string }) => (
    <div className={`fav ${c}`} style={{ borderRadius: "50%" }}>
      {children}
    </div>
  );
  const send = (cmd: string) => window.chiaroscuro.sendCommand(cmd, undefined);
  return (
    <div id="d8" className="design">
      <div className="titlebar" style={drag}>
        <div className="nav-btns" style={noDrag}>
          <button type="button" data-tip="Back">
            <IcoBack />
          </button>
          <button type="button" data-tip="Forward">
            <IcoForward />
          </button>
          <button type="button" data-tip="Refresh">
            <IcoRefresh />
          </button>
        </div>
        <div className="url-pill" style={noDrag}>
          <span className="url-text">localhost:5173</span>
          <button
            type="button"
            className="url-copy"
            data-tip="Copy URL"
            onClick={() => send("window:copy-address")}
          >
            <IcoCopy />
          </button>
        </div>
        <WC hideCopy />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="pinned-strip">
            <div className="pinned-icon" data-tip="Gmail">
              <RF c="fav-gm">G</RF>
            </div>
            <div className="pinned-icon" data-tip="Calendar">
              <RF c="fav-cal">C</RF>
            </div>
            <div className="pinned-icon" data-tip="Slack">
              <RF c="fav-sl">S</RF>
            </div>
          </div>
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <RF c="fav-gh">G</RF>
            <span className="t">GitHub — chiaroscuro2</span>
            <button type="button" className="tab-close" data-tip="Close tab">
              <IcoX />
            </button>
          </div>
          <div className="tab">
            <RF c="fav-fig">F</RF>
            <span className="t">Figma — UI Kit</span>
            <button type="button" className="tab-close" data-tip="Close tab">
              <IcoX />
            </button>
          </div>
          <div className="folder-hd">
            <IcoChevDown />
            <IcoFolderOpen />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <RF c="fav-doc">D</RF>
              <span className="t">Electron Docs</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <IcoX />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-not">N</RF>
              <span className="t">Notion — Notes</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <IcoX />
              </button>
            </div>
          </div>
          <div className="folder-hd closed">
            <IcoChevRight />
            <IcoFolder />
            Archive
          </div>
          <div className="tab">
            <RF c="fav-lin">L</RF>
            <span className="t">Linear — Sprint Board</span>
            <button type="button" className="tab-close" data-tip="Close tab">
              <IcoX />
            </button>
          </div>
          <div className="eph-section">
            <div className="eph-divider">
              <div className="eph-line" />
              <button type="button" className="eph-clear" data-tip="Clear ephemeral tabs">
                Clear <IcoBroom />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-red">R</RF>
              <span className="t">Reddit — r/webdev</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <IcoX />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-wk">W</RF>
              <span className="t">Wikipedia — Chiaroscuro</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <IcoX />
              </button>
            </div>
          </div>
          <div className="ws-bar">
            <div className="ws-icons">
              <button type="button" className="ws-bubble c1 active">
                W
              </button>
              <button type="button" className="ws-bubble c2">
                P
              </button>
              <button type="button" className="ws-bubble c3">
                S
              </button>
            </div>
            <div className="ws-ctrls">
              <button type="button" className="ws-ctrl" data-tip="Edit workspace">
                <IcoPencil />
              </button>
              <button type="button" className="ws-ctrl ws-add" data-tip="Add workspace">
                <IcoPlus />
              </button>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D9() {
  return (
    <div id="d9" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
      </div>
      <div className="panels">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-dot c1 active" />
            <button type="button" className="ws-dot c2" />
            <button type="button" className="ws-dot c3" />
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <div className="fav fav-gm">G</div>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="fav fav-cal">C</div>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="fav fav-sl">S</div>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <div className="fav fav-gh">G</div>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="fav fav-fig">F</div>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoChevDown />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="fav fav-lin">L</div>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <div className="fav fav-red">R</div>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="fav fav-wk">W</div>
              <span className="t">Wikipedia</span>
            </div>
          </div>
        </div>
        <div className="content-panel">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

function D10() {
  return (
    <div id="d10" className="design">
      <div className="titlebar" style={drag}>
        <span className="url">localhost:5173</span>
        <WC />
        <div className="loading-bar" />
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="ws-row">
            <button type="button" className="ws-circ active">
              W
            </button>
            <button type="button" className="ws-circ">
              P
            </button>
            <button type="button" className="ws-circ">
              S
            </button>
          </div>
          <div className="lbl">Pinned</div>
          <div className="tab">
            <div className="fav fav-gm">G</div>
            <span className="t">Gmail</span>
          </div>
          <div className="tab">
            <div className="fav fav-cal">C</div>
            <span className="t">Calendar</span>
          </div>
          <div className="tab">
            <div className="fav fav-sl">S</div>
            <span className="t">Slack</span>
          </div>
          <div className="sep" />
          <div className="lbl">Bookmarked</div>
          <div className="tab active">
            <div className="fav fav-gh">G</div>
            <span className="t">GitHub — chiaroscuro2</span>
          </div>
          <div className="tab">
            <div className="fav fav-fig">F</div>
            <span className="t">Figma — UI Kit</span>
          </div>
          <div className="folder-hd">
            <IcoFolder size={10} />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <div className="fav fav-doc">D</div>
              <span className="t">Electron Docs</span>
            </div>
            <div className="tab">
              <div className="fav fav-not">N</div>
              <span className="t">Notion — Notes</span>
            </div>
          </div>
          <div className="tab">
            <div className="fav fav-lin">L</div>
            <span className="t">Linear — Sprint Board</span>
          </div>
          <div className="eph-section">
            <div className="sep" />
            <div className="lbl">Ephemeral</div>
            <div className="tab">
              <div className="fav fav-red">R</div>
              <span className="t">Reddit — r/webdev</span>
            </div>
            <div className="tab">
              <div className="fav fav-wk">W</div>
              <span className="t">Wikipedia — Chiaroscuro</span>
            </div>
          </div>
        </div>
        <div className="content">
          <MockPage />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════ */
const DESIGNS = [
  { id: "d8", name: "Baseline", C: D8 },
  { id: "d2", name: "Drift", C: D2 },
  { id: "d3", name: "Obsidian", C: D3 },
  { id: "d4", name: "Ether", C: D4 },
  { id: "d5", name: "Haze", C: D5 },
  { id: "d6", name: "Dusk", C: D6 },
  { id: "d7", name: "Stencil", C: D7 },
  { id: "d1", name: "Whisper", C: D1 },
  { id: "d9", name: "Vault", C: D9 },
  { id: "d10", name: "Porcelain", C: D10 },
] as const;

export function DesignMockups() {
  const [active, setActive] = useState("d8");
  const [fading, setFading] = useState<string | null>(null);

  const switchTo = useCallback(
    (id: string) => {
      if (id === active) return;
      setFading(active);
      setActive(id);
      setTimeout(() => setFading(null), 350);
    },
    [active],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = e.key === "0" ? 10 : Number.parseInt(e.key);
      const d = DESIGNS[n - 1];
      if (n >= 1 && n <= 10 && d) switchTo(d.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [switchTo]);

  return (
    <div className={`dm${active === "d8" ? " dm-transparent" : ""}`}>
      {DESIGNS.map(({ id, C }) => {
        const isActive = id === active;
        const isFading = id === fading;
        return (
          <div key={id} style={{ display: isActive || isFading ? "contents" : "none" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: isActive ? 1 : 0,
                transition: "opacity 0.35s ease",
                pointerEvents: isActive ? "auto" : "none",
              }}
            >
              <C />
            </div>
          </div>
        );
      })}

      <div className="switcher" style={noDrag}>
        <div className="row">
          {DESIGNS.slice(0, 5).map((d, i) => (
            <button
              key={d.id}
              type="button"
              className={active === d.id ? "active" : ""}
              onClick={() => switchTo(d.id)}
            >
              <span className="n">{i + 1}</span>
              <span className="l">{d.name}</span>
            </button>
          ))}
        </div>
        <div className="row">
          {DESIGNS.slice(5).map((d, i) => (
            <button
              key={d.id}
              type="button"
              className={active === d.id ? "active" : ""}
              onClick={() => switchTo(d.id)}
            >
              <span className="n">{i === 4 ? "0" : String(i + 6)}</span>
              <span className="l">{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

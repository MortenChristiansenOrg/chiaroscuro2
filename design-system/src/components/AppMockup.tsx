import "../assets/app-mockup.css";

/* ═══════════════════════════════════════
   SVG Icons
   ═══════════════════════════════════════ */
const S = {
  width: 10,
  height: 10,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
} as const;
const IcoCopy = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 12 12" width={11} height={11} strokeWidth={1}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <path d="M8.5,3.5V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5.5a1 1 0 001 1h1.5" />
  </svg>
);
const IcoMin = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 1">
    <rect width="10" height="1" fill="currentColor" stroke="none" />
  </svg>
);
const IcoMax = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" strokeWidth={1}>
    <rect x="0.5" y="0.5" width="9" height="9" />
  </svg>
);
const IcoX = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" strokeWidth={1.2}>
    <line x1="0" y1="0" x2="10" y2="10" />
    <line x1="10" y1="0" x2="0" y2="10" />
  </svg>
);
const IcoChevDown = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" width={10} height={10} strokeWidth={1.5}>
    <polyline points="2,3.5 5,6.5 8,3.5" />
  </svg>
);
const IcoChevRight = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" width={9} height={9} strokeWidth={1.5}>
    <polyline points="3.5,2 6.5,5 3.5,8" />
  </svg>
);
const IcoFolder = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
  </svg>
);
const IcoFolderOpen = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 14l1.5-2.9A2 2 0 019.24 10H20a2 2 0 011.94 2.5l-1.54 6a2 2 0 01-1.95 1.5H4a2 2 0 01-2-2V5a2 2 0 012-2h3.9a2 2 0 011.69.9l.81 1.2a2 2 0 001.67.9H18a2 2 0 012 2v2" />
  </svg>
);
const IcoPencil = () => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
const IcoPlus = () => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IcoBroom = () => (
  <svg
    width={10}
    height={10}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.3}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="13" y1="3" x2="8" y2="8" />
    <line x1="8" y1="8" x2="3" y2="13" />
    <line x1="8" y1="8" x2="2.5" y2="11" />
    <line x1="8" y1="8" x2="5" y2="13.5" />
  </svg>
);
const IcoBack = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" strokeWidth={1.5}>
    <polyline points="6.5,2 3.5,5 6.5,8" />
  </svg>
);
const IcoForward = () => (
  <svg aria-hidden="true" {...S} viewBox="0 0 10 10" strokeWidth={1.5}>
    <polyline points="3.5,2 6.5,5 3.5,8" />
  </svg>
);
const IcoRefresh = () => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

/* ═══════════════════════════════════════
   Window Controls
   ═══════════════════════════════════════ */
function WC() {
  return (
    <div className="wc">
      <button type="button" data-tip="Minimize">
        <IcoMin />
      </button>
      <button type="button" data-tip="Maximize">
        <IcoMax />
      </button>
      <button type="button" className="close" data-tip="Close">
        <IcoX />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   Mock Page Content
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
            inspiration.
          </p>
        </div>
        <div className="page-section-label">Collections</div>
        <div className="page-cards">
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Light &amp; Shadow</h3>
              <p>Exploring the interplay of illumination and darkness.</p>
            </div>
          </div>
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Earth Tones</h3>
              <p>Natural palettes drawn from landscapes and minerals.</p>
            </div>
          </div>
          <div className="page-card">
            <div className="page-card-img" />
            <div className="page-card-body">
              <h3>Geometric</h3>
              <p>Mathematical precision in contemporary visual art.</p>
            </div>
          </div>
        </div>
        <div className="page-footer">&copy; 2026 Gallery</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Favicon helper
   ═══════════════════════════════════════ */
function RF({ c, children }: { c: string; children: string }) {
  return (
    <div className={`fav ${c}`} style={{ borderRadius: "50%" }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════
   AppMockup — D8 Baseline
   ═══════════════════════════════════════ */
export function AppMockup() {
  return (
    <div className="app-mockup">
      <div className="titlebar">
        <div className="nav-btns">
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
        <div className="url-pill">
          <span className="url-text">localhost:5173</span>
          <button type="button" className="url-copy" data-tip="Copy URL">
            <IcoCopy />
          </button>
        </div>
        <WC />
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

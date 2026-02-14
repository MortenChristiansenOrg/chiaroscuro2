import { Icon } from "@/components/Icon";
import "../assets/app-mockup.css";

/* ═══════════════════════════════════════
   Window Controls
   ═══════════════════════════════════════ */
function WC() {
  return (
    <div className="wc">
      <button type="button" data-tip="Minimize">
        <Icon name="minus" />
      </button>
      <button type="button" data-tip="Maximize">
        <Icon name="square" style="regular" />
      </button>
      <button type="button" className="close" data-tip="Close">
        <Icon name="xmark" />
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
            <Icon name="chevron-left" />
          </button>
          <button type="button" data-tip="Forward">
            <Icon name="chevron-right" />
          </button>
          <button type="button" data-tip="Refresh">
            <Icon name="rotate-right" />
          </button>
        </div>
        <div className="url-pill">
          <span className="url-text">localhost:5173</span>
          <button type="button" className="url-copy" data-tip="Copy URL">
            <Icon name="copy" style="regular" />
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
              <Icon name="xmark" />
            </button>
          </div>
          <div className="tab">
            <RF c="fav-fig">F</RF>
            <span className="t">Figma — UI Kit</span>
            <button type="button" className="tab-close" data-tip="Close tab">
              <Icon name="xmark" />
            </button>
          </div>
          <div className="folder-hd">
            <Icon name="chevron-down" />
            <Icon name="folder-open" />
            Research
          </div>
          <div className="folder-children">
            <div className="tab">
              <RF c="fav-doc">D</RF>
              <span className="t">Electron Docs</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <Icon name="xmark" />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-not">N</RF>
              <span className="t">Notion — Notes</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <Icon name="xmark" />
              </button>
            </div>
          </div>
          <div className="folder-hd closed">
            <Icon name="chevron-right" />
            <Icon name="folder" />
            Archive
          </div>
          <div className="tab">
            <RF c="fav-lin">L</RF>
            <span className="t">Linear — Sprint Board</span>
            <button type="button" className="tab-close" data-tip="Close tab">
              <Icon name="xmark" />
            </button>
          </div>
          <div className="eph-section">
            <div className="eph-divider">
              <div className="eph-line" />
              <button type="button" className="eph-clear" data-tip="Clear ephemeral tabs">
                Clear <Icon name="broom" />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-red">R</RF>
              <span className="t">Reddit — r/webdev</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <Icon name="xmark" />
              </button>
            </div>
            <div className="tab">
              <RF c="fav-wk">W</RF>
              <span className="t">Wikipedia — Chiaroscuro</span>
              <button type="button" className="tab-close" data-tip="Close tab">
                <Icon name="xmark" />
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
                <Icon name="pencil" />
              </button>
              <button type="button" className="ws-ctrl ws-add" data-tip="Add workspace">
                <Icon name="plus" />
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

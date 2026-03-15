import { Icon } from "@/components/Icon";
import { SubTabFrame } from "@features/sub-tabs/SubTabFrame";
import { useRef, useState } from "react";

const buttonClass = "sub-tab-action-btn";

export function SubTabOverlayDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSurfaceClick = () => {
    if (isOpen) return;
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: 420,
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      <style>{`
        .${buttonClass} {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          background: white;
          color: oklch(0.35 0 0);
          font-size: 1.125rem;
          box-shadow: 0 4px 20px oklch(0 0 0 / 0.25), 0 1px 3px oklch(0 0 0 / 0.15);
          transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .${buttonClass}:hover {
          transform: scale(1.15);
        }
        .${buttonClass}:active {
          transform: scale(0.95);
        }
      `}</style>

      {/* Simulated parent tab surface — click to open */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: demo interaction only */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "oklch(0.85 0 0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "oklch(0.55 0 0)",
          fontSize: "var(--text-sm)",
          cursor: isOpen ? "default" : "pointer",
          userSelect: "none",
        }}
        onClick={handleSurfaceClick}
      >
        {!isOpen && "Click anywhere to open a sub-tab"}
      </div>

      <SubTabFrame
        isOpen={isOpen}
        onBackdropClick={handleClose}
        buttons={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className={buttonClass}
              aria-label="Close sub-tab"
              onClick={handleClose}
            >
              <Icon name="xmark" />
            </button>
            <button type="button" className={buttonClass} aria-label="Open as tab">
              <Icon name="up-right-from-square" />
            </button>
          </div>
        }
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--glass-text-muted)",
            fontSize: "var(--text-xs)",
          }}
        >
          Sub-tab content (WebContentsView)
        </div>
      </SubTabFrame>
    </div>
  );
}

import { useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import type { InstalledExtension } from "./extensions.shared";
import { openExtensionPopup, useExtensionsStore } from "./extensions.store";

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 26,
  border: "none",
  cursor: "pointer",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  transition:
    "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
};

const btnClass =
  "bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed";

function ExtensionButton({ ext, expanded }: { ext: InstalledExtension; expanded: boolean }) {
  const [iconFailed, setIconFailed] = useState(false);
  const hasPopup = !!ext.action?.popup;

  const handleClick = () => {
    if (hasPopup) {
      openExtensionPopup(ext.id);
    }
  };

  return (
    <button
      type="button"
      style={btnStyle}
      className={btnClass}
      tabIndex={expanded ? 0 : -1}
      onClick={handleClick}
      aria-label={ext.action?.title || ext.name}
      data-tip={ext.action?.title || ext.name}
    >
      {ext.action?.iconUrl && !iconFailed ? (
        <img
          src={ext.action.iconUrl}
          alt=""
          style={{ width: 14, height: 14 }}
          onError={() => setIconFailed(true)}
        />
      ) : (
        <Icon name="puzzle-piece" css={{ fontSize: "var(--icon-size-default)" }} />
      )}
    </button>
  );
}

export function ExtensionToolbar() {
  const extensions = useExtensionsStore((s) => s.extensions);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const withActions = extensions.filter((e) => e.enabled && e.action?.popup);
  if (withActions.length === 0) return null;

  return (
    <div ref={containerRef} className="flex items-center" style={{ gap: "0.0625rem" }}>
      {/* Extension buttons — slide in from right */}
      <div
        className="flex items-center overflow-hidden"
        aria-hidden={!open}
        style={{
          gap: "0.0625rem",
          maxWidth: open ? `${withActions.length * 29}px` : 0,
          opacity: open ? 1 : 0,
          transition:
            "max-width var(--duration-normal) var(--ease-out), opacity var(--duration-normal) var(--ease-out)",
        }}
      >
        {withActions.map((ext) => (
          <ExtensionButton key={ext.id} ext={ext} expanded={open} />
        ))}
      </div>

      {/* Toggle button */}
      <button
        type="button"
        style={btnStyle}
        className={btnClass}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Extensions"
        data-tip="Extensions"
        aria-expanded={open}
      >
        <Icon name="puzzle-piece" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

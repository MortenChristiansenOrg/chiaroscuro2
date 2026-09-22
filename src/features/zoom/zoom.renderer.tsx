import type { CSSProperties } from "react";
import { logError } from "../../shared/log";
import { ZOOM_DEFAULT, ZOOM_RESET } from "./zoom.shared";
import { selectActiveZoomLevel, useZoomStore } from "./zoom.store";

export function ZoomIndicator({ zoomLevel, onReset }: { zoomLevel: number; onReset: () => void }) {
  if (zoomLevel === ZOOM_DEFAULT) return null;
  const percentage = Math.round(1.2 ** zoomLevel * 100);

  return (
    <button
      type="button"
      className="flex items-center justify-center shrink-0 cursor-pointer bg-glass-subtle text-glass-text-default hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--accent-L)_var(--accent-C)_var(--accent-hue))] motion-reduce:transition-none!"
      style={
        {
          height: 26,
          padding: "0 0.5rem",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-sm)",
          fontVariantNumeric: "tabular-nums",
          WebkitAppRegion: "no-drag",
          transition:
            "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
        } as CSSProperties
      }
      aria-label={`Zoom ${percentage}%. Reset zoom to 100%`}
      data-tip="Reset zoom to 100%"
      onClick={onReset}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {percentage}%
    </button>
  );
}

export function ActiveZoomIndicator() {
  const zoomLevel = useZoomStore(selectActiveZoomLevel);
  return (
    <ZoomIndicator
      zoomLevel={zoomLevel}
      onReset={() => {
        window.chiaroscuro
          .sendCommand(ZOOM_RESET, undefined)
          .catch(logError("zoom", "reset from indicator"));
      }}
    />
  );
}

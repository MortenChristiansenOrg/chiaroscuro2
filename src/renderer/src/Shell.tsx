import { type ComponentType, useCallback, useEffect, useRef } from "react";
import { useTabsStore } from "../../features/tabs/tabs.store";
import { TooltipLayer } from "./components/TooltipLayer";

type EventSubscriber = (
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
) => () => void;

interface FeatureRegistration {
  name: string;
  Chrome?: ComponentType;
  Sidebar?: ComponentType;
  Overlay?: ComponentType;
  subscribeToEvents?: EventSubscriber;
}

const features: FeatureRegistration[] = [];

/** Register a feature and immediately subscribe to events (phase 1). */
export function registerFeature(reg: FeatureRegistration): void {
  features.push(reg);
  if (reg.subscribeToEvents) {
    reg.subscribeToEvents(window.chiaroscuro.onEvent);
  }
}

/** Signal main process that all subscriptions are wired (triggers phase 2 start). */
export function signalReady(): void {
  window.chiaroscuro.signalReady();
}

function ContentArea() {
  const ref = useRef<HTMLDivElement>(null);
  const activeTabId = useTabsStore((s) => s.activeTabId);

  const reportBounds = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Convert CSS px to device px for Electron's setBounds
    const dpr = window.devicePixelRatio;
    window.chiaroscuro.sendCommand("tabs:report-content-bounds", {
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr),
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(reportBounds);
    observer.observe(el);

    // Also report on window resize (can change position without size change)
    window.addEventListener("resize", reportBounds);

    // Initial report
    reportBounds();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportBounds);
    };
  }, [reportBounds]);

  return (
    <div
      ref={ref}
      className="relative flex-1 rounded-lg m-[5px] overflow-hidden"
      style={{
        boxShadow: "0 1px 8px oklch(0 0 0 / 0.08)",
        background: "oklch(0.995 0 0)",
      }}
    >
      {!activeTabId && (
        <div
          className="absolute inset-0 flex items-center justify-center select-none"
          style={{ color: "oklch(0 0 0 / 0.18)" }}
        >
          <span style={{ fontSize: 13, letterSpacing: "0.01em" }}>
            Press{" "}
            <kbd
              style={{
                padding: "1px 6px",
                borderRadius: 5,
                border: "1px solid oklch(0 0 0 / 0.12)",
                background: "oklch(0 0 0 / 0.04)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              Ctrl+T
            </kbd>{" "}
            to open a tab
          </span>
        </div>
      )}
    </div>
  );
}

export function Shell() {
  return (
    <>
      {/* Chrome zone */}
      {features.map((f) => f.Chrome && <f.Chrome key={f.name} />)}

      {/* Body: sidebar + content */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          background: "oklch(0.45 0.04 250 / 0.12)",
          backdropFilter: "blur(12px)",
        }}
      >
        {features.map((f) => f.Sidebar && <f.Sidebar key={`sidebar-${f.name}`} />)}
        <ContentArea />
      </div>

      {/* Overlay zone */}
      {features.map((f) => f.Overlay && <f.Overlay key={`overlay-${f.name}`} />)}

      <TooltipLayer />
    </>
  );
}

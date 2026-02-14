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

export function ContentArea() {
  const ref = useRef<HTMLDivElement>(null);
  const activeTabId = useTabsStore((s) => s.activeTabId);

  const reportBounds = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // setBounds expects CSS px (DIPs), same as getBoundingClientRect
    window.chiaroscuro.sendCommand("tabs:report-content-bounds", {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
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
      className="relative flex-1 rounded-lg overflow-hidden"
      style={{
        margin: "0 var(--content-inset) var(--content-inset)",
        boxShadow: "var(--shadow-medium)",
        background: activeTabId ? "var(--content-bg)" : "oklch(1 0 0 / 0.08)",
      }}
    >
      {!activeTabId && (
        <div
          className="absolute inset-0 flex items-center justify-center select-none"
          style={{ color: "oklch(1 0 0 / 0.35)" }}
        >
          <span style={{ fontSize: 13, letterSpacing: "0.01em" }}>
            Press{" "}
            <kbd
              style={{
                padding: "1px 6px",
                borderRadius: 5,
                border: "1px solid oklch(1 0 0 / 0.15)",
                background: "oklch(1 0 0 / 0.06)",
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
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-backdrop-blur))",
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

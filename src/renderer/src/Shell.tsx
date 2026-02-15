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
  const pendingRaf = useRef(false);
  const activeTabId = useTabsStore((s) => s.activeTabId);

  const reportBounds = useCallback(() => {
    if (pendingRaf.current) return;
    pendingRaf.current = true;
    requestAnimationFrame(() => {
      pendingRaf.current = false;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      window.chiaroscuro.sendCommand("tabs:report-content-bounds", {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
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
    <main
      ref={ref}
      className="relative flex-1 rounded-lg overflow-hidden"
      style={{
        margin: "0 var(--content-inset) var(--content-inset)",
        boxShadow: "var(--shadow-medium)",
        background: activeTabId ? "var(--content-bg)" : "var(--glass-subtle)",
      }}
    >
      {!activeTabId && (
        <div
          className="absolute inset-0 flex items-center justify-center select-none"
          style={{ color: "var(--glass-text-muted)" }}
        >
          <span style={{ fontSize: "var(--text-base)", letterSpacing: "0.01em" }}>
            Press{" "}
            <kbd
              style={{
                padding: "0.0625rem 0.375rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--glass-border)",
                background: "var(--glass-subtle)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
              }}
            >
              Ctrl+T
            </kbd>{" "}
            to open a tab
          </span>
        </div>
      )}
    </main>
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

import { useCallback, useEffect, useRef } from "react";
// shell-composite: read-only cross-feature store access
import { useTabCustomizationStore } from "../../../features/tab-customization/tab-customization.store";
import { useTabsStore } from "../../../features/tabs/tabs.store";
import { BuiltInPage } from "./BuiltInPage";

export function ContentArea() {
  const ref = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => (s.activeTabId ? s.tabs.get(s.activeTabId) : undefined));
  const isBuiltIn = activeTab?.builtIn === true;
  const editingTabId = useTabCustomizationStore((s) => s.editingTabId);
  const isCustomizing = editingTabId !== null && editingTabId === activeTabId;

  const reportBounds = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
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

  // Report zero bounds when built-in tab active (hide any WCV)
  const reportZeroBounds = useCallback(() => {
    window.chiaroscuro.sendCommand("tabs:report-content-bounds", {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (isBuiltIn || isCustomizing) {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      reportZeroBounds();
      return;
    }

    const observer = new ResizeObserver(reportBounds);
    observer.observe(el);
    window.addEventListener("resize", reportBounds);
    reportBounds();

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      observer.disconnect();
      window.removeEventListener("resize", reportBounds);
    };
  }, [reportBounds, reportZeroBounds, isBuiltIn, isCustomizing]);

  return (
    <main
      ref={ref}
      className="relative flex-1 rounded-lg overflow-hidden"
      style={{
        margin: "0 var(--content-inset) var(--content-inset) var(--content-inset)",
        boxShadow: "var(--shadow-medium)",
        background: activeTabId ? "var(--content-bg)" : "var(--glass-subtle)",
      }}
    >
      {isBuiltIn && activeTab && <BuiltInPage url={activeTab.url} />}
      {isCustomizing && <BuiltInPage url={`app:tab-customization?tabId=${editingTabId}`} />}
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

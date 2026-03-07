import { useCallback, useEffect, useRef } from "react";
// shell-composite: read-only cross-feature store access
import { useTabCustomizationStore } from "../../../features/tab-customization/tab-customization.store";
import { useTabsStore } from "../../../features/tabs/tabs.store";
import { TerminalPanel } from "../../../features/terminal/terminal.renderer";
import { useTerminalStore } from "../../../features/terminal/terminal.store";
import { BuiltInPage } from "./BuiltInPage";

export function ContentArea() {
  const mainRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => (s.activeTabId ? s.tabs.get(s.activeTabId) : undefined));
  const isBuiltIn = activeTab?.builtIn === true;
  const editingTabId = useTabCustomizationStore((s) => s.editingTabId);
  const isCustomizing = editingTabId !== null && editingTabId === activeTabId;
  const terminalVisible = useTerminalStore((s) => s.visible);

  const reportBounds = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      // Report bounds of the content portion (above terminal), not the whole main
      const el = contentRef.current ?? mainRef.current;
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: terminalVisible changes which element to observe for bounds
  useEffect(() => {
    const el = contentRef.current ?? mainRef.current;
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
  }, [reportBounds, reportZeroBounds, isBuiltIn, isCustomizing, terminalVisible]);

  // Show terminal only for non-built-in, non-customizing tabs
  const showTerminal = terminalVisible && !isBuiltIn && !isCustomizing && !!activeTabId;

  return (
    <main
      ref={mainRef}
      className="relative flex-1 overflow-hidden flex flex-col"
      style={{
        margin: "0 var(--content-inset) var(--content-inset) var(--content-inset)",
        boxShadow: "var(--shadow-medium)",
        background: !activeTabId
          ? "var(--glass-subtle)"
          : showTerminal
            ? "transparent"
            : "var(--content-bg)",
        borderRadius: "var(--radius)",
      }}
    >
      {/* Content portion — bounds reported for WCV positioning */}
      <div
        ref={contentRef}
        className="relative flex-1 overflow-hidden"
        style={showTerminal ? { background: "var(--content-bg)" } : undefined}
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
                  borderRadius: "var(--radius-sm, 0.25rem)",
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
      </div>

      {/* Terminal panel — below content, shrinks WCV bounds */}
      {showTerminal && <TerminalPanel />}
    </main>
  );
}

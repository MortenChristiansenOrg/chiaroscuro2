import type { ComponentType } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { ContentArea } from "./components/ContentArea";
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

function ZoneFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        padding: "1rem",
        gap: "0.5rem",
        color: "var(--glass-text-muted)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span>Something went wrong</span>
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--glass-text-hint)",
          maxWidth: 300,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {error instanceof Error ? error.message : String(error)}
      </span>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="cursor-pointer text-glass-text-default hover:bg-glass-hover"
        style={{
          fontSize: "var(--text-xs)",
          padding: "0.25rem 0.75rem",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--glass-border)",
          background: "var(--glass-subtle)",
          fontFamily: "inherit",
        }}
      >
        Retry
      </button>
    </div>
  );
}

export function Shell() {
  return (
    <ErrorBoundary FallbackComponent={ZoneFallback}>
      <div data-testid="shell-ready" style={{ display: "contents" }} />
      {/* Chrome zone */}
      {features.map(
        (f) =>
          f.Chrome && (
            <ErrorBoundary key={f.name} FallbackComponent={ZoneFallback}>
              <f.Chrome />
            </ErrorBoundary>
          ),
      )}

      {/* Body: sidebar + content */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-backdrop-blur))",
        }}
      >
        {features.map(
          (f) =>
            f.Sidebar && (
              <ErrorBoundary key={`sidebar-${f.name}`} FallbackComponent={ZoneFallback}>
                <f.Sidebar />
              </ErrorBoundary>
            ),
        )}
        <ErrorBoundary FallbackComponent={ZoneFallback}>
          <ContentArea />
        </ErrorBoundary>
      </div>

      {/* Overlay zone */}
      {features.map(
        (f) =>
          f.Overlay && (
            <ErrorBoundary key={`overlay-${f.name}`} FallbackComponent={ZoneFallback}>
              <f.Overlay />
            </ErrorBoundary>
          ),
      )}

      <TooltipLayer />
    </ErrorBoundary>
  );
}

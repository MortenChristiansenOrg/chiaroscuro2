import type { ComponentType } from "react";
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

import { type ComponentType, useEffect } from "react";
import { TooltipLayer } from "./components/TooltipLayer";

type EventSubscriber = (
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
) => () => void;

interface FeatureRegistration {
  name: string;
  /** Component rendered in the chrome/header area */
  Chrome?: ComponentType;
  /** Subscribe to event bus — called once at mount, returns cleanup */
  subscribeToEvents?: EventSubscriber;
}

const features: FeatureRegistration[] = [];

/** Features call this to register their UI contributions */
export function registerFeature(reg: FeatureRegistration): void {
  features.push(reg);
}

export function Shell() {
  useEffect(() => {
    const unsubs = features
      .filter((f) => f.subscribeToEvents)
      .map((f) => f.subscribeToEvents?.(window.chiaroscuro.onEvent));
    return () => {
      for (const unsub of unsubs) unsub?.();
    };
  }, []);

  return (
    <>
      {features.map((f) => f.Chrome && <f.Chrome key={f.name} />)}
      <TooltipLayer />
    </>
  );
}

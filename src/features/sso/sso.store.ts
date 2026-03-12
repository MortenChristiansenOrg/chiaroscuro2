import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import { SSO_CHANGED, type SsoEvents, type SsoState } from "./sso.shared";

interface SsoStoreState {
  state: SsoState | null;
}

export const useSsoStore = create<SsoStoreState>()(() => ({
  state: null,
}));

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function saveSsoSettings(settings: SsoState["settings"]): void {
  const current = useSsoStore.getState().state;
  if (!current) return;
  useSsoStore.setState({ state: { ...current, settings } });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.chiaroscuro.sendCommand("sso:save", settings).catch(console.error);
  }, 300);
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<SsoEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(SSO_CHANGED, (ssoState) => {
      useSsoStore.setState({ state: ssoState });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/** Stub window.chiaroscuro so feature renderer modules can be imported in the design system. */
// biome-ignore lint/suspicious/noExplicitAny: stub for design system
(window as any).chiaroscuro = {
  platform: "design-system",
  sendCommand: (_name: string, _payload?: unknown) => Promise.resolve(),
  onEvent: (_name: string, _callback: (payload: unknown) => void) => () => {},
  getPlatformName: () => "win32",
  signalReady: () => {},
};

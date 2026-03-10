/**
 * The command palette UI now renders in a dedicated transparent BrowserWindow
 * overlay (created by the platform layer). This component is kept as a no-op
 * stub because it's registered as an Overlay in command-palette.feature.ts.
 * The Zustand store still tracks open/close state for other shell components
 * that may need it.
 */
export function CommandPaletteOverlay() {
  return null;
}

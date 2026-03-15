/**
 * Sub-tab renderer — now a no-op. The animation and backdrop are handled
 * by the native overlay (transparent BrowserWindow) and CSS injection on
 * the parent tab. The store is still subscribed via sub-tabs.feature.ts.
 */
export function SubTabOverlay() {
  return null;
}

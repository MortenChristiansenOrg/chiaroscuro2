import type { TabId } from "./types";

/**
 * Associates cleanup functions with tab IDs. Call `cleanup(tabId)` to run
 * and remove all registered cleanups for that tab. Wire to TABS_CLOSED in
 * the feature's register() to get automatic cleanup.
 */
export class TabScope {
  private cleanups = new Map<TabId, (() => void)[]>();

  /** Register a cleanup function for a tab. */
  add(tabId: TabId, cleanup: () => void): void {
    let fns = this.cleanups.get(tabId);
    if (!fns) {
      fns = [];
      this.cleanups.set(tabId, fns);
    }
    fns.push(cleanup);
  }

  /** Run and remove all cleanups for a tab. */
  cleanup(tabId: TabId): void {
    const fns = this.cleanups.get(tabId);
    if (fns) {
      for (const fn of fns) fn();
      this.cleanups.delete(tabId);
    }
  }

  /** Whether any cleanups are registered for this tab. */
  has(tabId: TabId): boolean {
    return this.cleanups.has(tabId);
  }
}

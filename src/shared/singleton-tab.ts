import type { TabId } from "./types";

interface TabOps {
  activate: (tabId: TabId) => Promise<void>;
  create: (url: string) => Promise<TabId>;
}

/**
 * Tracks a single built-in tab. Re-activates if already open,
 * creates if not. Auto-clears when the tab closes — wire
 * `onClose(tabId)` to TABS_CLOSED in the feature's register().
 */
export class SingletonTab {
  private tabId: TabId | undefined;

  constructor(private ops: TabOps) {}

  async openOrActivate(url: string): Promise<TabId> {
    if (this.tabId) {
      try {
        await this.ops.activate(this.tabId);
        return this.tabId;
      } catch {
        this.tabId = undefined;
      }
    }
    this.tabId = await this.ops.create(url);
    return this.tabId;
  }

  /** Call from TABS_CLOSED handler to clear tracking. */
  onClose(tabId: TabId): void {
    if (this.tabId === tabId) this.tabId = undefined;
  }
}

/**
 * Like SingletonTab but tracks one tab per key (e.g. per domain).
 * Wire `onClose(tabId)` to TABS_CLOSED.
 */
export class SingletonTabMap {
  private tabIds = new Map<string, TabId>();

  constructor(private ops: TabOps) {}

  async openOrActivate(key: string, url: string): Promise<TabId> {
    const existing = this.tabIds.get(key);
    if (existing) {
      try {
        await this.ops.activate(existing);
        return existing;
      } catch {
        this.tabIds.delete(key);
      }
    }
    const tabId = await this.ops.create(url);
    this.tabIds.set(key, tabId);
    return tabId;
  }

  /** Call from TABS_CLOSED handler to clear tracking. */
  onClose(tabId: TabId): void {
    for (const [key, id] of this.tabIds) {
      if (id === tabId) {
        this.tabIds.delete(key);
        break;
      }
    }
  }
}

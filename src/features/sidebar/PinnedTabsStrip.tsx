import type { ContextMenuItem } from "../../renderer/src/components/ContextMenu";
import type { TabId } from "../../shared/types";
import type { PinnedTabsCommands } from "../pinned-tabs/pinned-tabs.shared";
import { PINNED_TABS_ACTIVATE, PINNED_TABS_TOGGLE_PIN } from "../pinned-tabs/pinned-tabs.shared";
import {
  TAB_CUSTOMIZATION_OPEN,
  type TabCustomizationCommands,
} from "../tab-customization/tab-customization.shared";
import { useTabCustomizationStore } from "../tab-customization/tab-customization.store";
import type { Tab, TabsCommands } from "../tabs/tabs.shared";
import { TABS_CLOSE, TABS_NAVIGATE } from "../tabs/tabs.shared";
import { Favicon } from "./Favicon";

// ── Typed sendCommand ───────────────────────────────────────────

type PinnedUsedCommands = Pick<TabsCommands, typeof TABS_CLOSE | typeof TABS_NAVIGATE> &
  Pick<PinnedTabsCommands, typeof PINNED_TABS_ACTIVATE | typeof PINNED_TABS_TOGGLE_PIN> &
  Pick<TabCustomizationCommands, typeof TAB_CUSTOMIZATION_OPEN>;

function sendCommand<K extends keyof PinnedUsedCommands>(
  name: K,
  payload: PinnedUsedCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Components ──────────────────────────────────────────────────

function PinnedTabButton({
  pt,
  tab,
  isActive,
  onContextMenu,
}: {
  pt: { id: TabId; url: string; title: string; favicon: string };
  tab: Tab | undefined;
  isActive: boolean;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  const customTitle = useTabCustomizationStore((s) => s.customizations.get(pt.id))?.title;
  const displayTitle = customTitle || pt.title || pt.url;
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    const items: ContextMenuItem[] = [];
    items.push(
      {
        label: "Unpin tab",
        icon: "thumbtack-slash",
        onSelect: () => sendCommand(PINNED_TABS_TOGGLE_PIN, { tabId: pt.id }),
      },
      {
        label: "Close tab",
        icon: "xmark",
        onSelect: () => sendCommand(TABS_CLOSE, { tabId: pt.id }),
      },
      {
        label: "Customize tab",
        icon: "sliders",
        onSelect: () => sendCommand(TAB_CUSTOMIZATION_OPEN, { tabId: pt.id }),
      },
    );
    if (tab?.url && tab.url !== pt.url) {
      items.push({
        label: "Restore original URL",
        icon: "arrow-rotate-left",
        onSelect: () => sendCommand(TABS_NAVIGATE, { tabId: pt.id, url: pt.url }),
      });
    }
    onContextMenu(items, e);
  };

  return (
    <button
      type="button"
      className={`flex flex-1 items-center justify-center cursor-pointer transition-colors duration-150 ${isActive ? "bg-glass-active" : "bg-glass-subtle hover:bg-glass-hover active:bg-glass-pressed"}`}
      style={{
        height: 32,
        minWidth: 0,
        borderRadius: "var(--radius-md)",
        border: "none",
        boxShadow: isActive ? "var(--shadow-subtle)" : undefined,
      }}
      tabIndex={-1}
      onClick={() => sendCommand(PINNED_TABS_ACTIVATE, { tabId: pt.id })}
      onContextMenu={handleContextMenu}
      data-pinned-tab={pt.id}
      data-tip={displayTitle}
      aria-label={displayTitle}
    >
      <Favicon tab={tab ?? pt} />
    </button>
  );
}

export function PinnedTabsStrip({
  pinnedTabs,
  tabs,
  activeTabId,
  onContextMenu,
}: {
  pinnedTabs: { id: TabId; url: string; title: string; favicon: string }[];
  tabs: Map<TabId, Tab>;
  activeTabId: TabId | null;
  onContextMenu?: (items: ContextMenuItem[], e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex"
      style={{
        gap: "0.5rem",
        padding: "0 0.375rem 0.25rem",
      }}
    >
      {pinnedTabs.map((pt) => (
        <PinnedTabButton
          key={pt.id}
          pt={pt}
          tab={tabs.get(pt.id)}
          isActive={pt.id === activeTabId}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

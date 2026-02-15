import { useCommandPaletteStore } from "@features/command-palette/command-palette.store";
import { useSidebarStore } from "@features/sidebar/sidebar.store";
import type { Tab } from "@features/tabs/tabs.shared";
import { useTabsStore } from "@features/tabs/tabs.store";
import { useWindowChromeStore } from "@features/window-chrome/window-chrome.store";
import type { Workspace } from "@features/workspaces/workspaces.shared";
import { useWorkspacesStore } from "@features/workspaces/workspaces.store";
import { type ReactNode, useEffect } from "react";
import type { TabId, WorkspaceId } from "../../../src/shared/types";
import { ComponentPreview } from "./ComponentPreview";

interface StoreOverrides {
  tabs?: { tabs: Map<TabId, Tab>; activeTabId: TabId | null };
  workspaces?: { workspaces: Workspace[]; activeWorkspaceId: WorkspaceId | null };
  sidebar?: { visible: boolean };
  commandPalette?: { open: boolean };
  windowChrome?: { maximized: boolean; loadingTabs: Set<TabId> };
}

export function LivePreview({
  children,
  label,
  stores,
}: {
  children: ReactNode;
  label?: string;
  stores?: StoreOverrides;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: stores are static in MDX previews
  useEffect(() => {
    if (stores?.tabs) useTabsStore.setState(stores.tabs);
    if (stores?.workspaces) useWorkspacesStore.setState(stores.workspaces);
    if (stores?.sidebar) useSidebarStore.setState(stores.sidebar);
    if (stores?.commandPalette) useCommandPaletteStore.setState(stores.commandPalette);
    if (stores?.windowChrome) useWindowChromeStore.setState(stores.windowChrome);

    return () => {
      if (stores?.tabs) useTabsStore.setState({ tabs: new Map(), activeTabId: null });
      if (stores?.workspaces)
        useWorkspacesStore.setState({ workspaces: [], activeWorkspaceId: null });
      if (stores?.sidebar) useSidebarStore.setState({ visible: true });
      if (stores?.commandPalette) useCommandPaletteStore.setState({ open: false });
      if (stores?.windowChrome)
        useWindowChromeStore.setState({ maximized: false, loadingTabs: new Set() });
    };
  }, []);

  return (
    <ComponentPreview label={label}>
      <div
        style={{
          background: "var(--window-bg)",
          borderRadius: "var(--radius-lg)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {children}
      </div>
    </ComponentPreview>
  );
}

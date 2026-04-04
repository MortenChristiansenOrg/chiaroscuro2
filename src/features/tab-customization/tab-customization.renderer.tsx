import { useEffect, useRef, useState } from "react";
import type { BuiltInPageProps } from "../../renderer/src/components/BuiltInPage";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  SettingsLayout,
  settingsCategoryHeadingStyle,
  settingsInputStyle,
  useScrollSpy,
} from "../../renderer/src/components/SettingsLayout";
import type { TabId } from "../../shared/types";
import { LocalWebAppSettings } from "../local-web-app/local-web-app.renderer";
import { useTabsStore } from "../tabs/tabs.store";
import {
  DEFAULT_NAVIGATION_BLOCK_RULE,
  type NavigationBlockRule,
  TAB_CUSTOMIZATION_CLOSE,
  TAB_CUSTOMIZATION_GET_STATE,
  TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED,
  TAB_CUSTOMIZATION_SET_NAVIGATION,
  TAB_CUSTOMIZATION_SET_TITLE,
  type TabCustomization,
  type TabCustomizationCommands,
} from "./tab-customization.shared";
import { useTabCustomizationStore } from "./tab-customization.store";

type UsedCommands = Pick<
  TabCustomizationCommands,
  | typeof TAB_CUSTOMIZATION_CLOSE
  | typeof TAB_CUSTOMIZATION_SET_TITLE
  | typeof TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED
  | typeof TAB_CUSTOMIZATION_SET_NAVIGATION
>;

function sendCommand<K extends keyof UsedCommands>(name: K, payload: UsedCommands[K]["payload"]) {
  void window.chiaroscuro.sendCommand(name, payload).catch(console.error);
}

const categories = [
  { id: "appearance", label: "Appearance" },
  { id: "navigation", label: "Navigation" },
  { id: "local-web-app", label: "Local Web App" },
];

function ToggleButton({
  enabled,
  onClick,
  label,
}: {
  enabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 font-[inherit] text-[length:var(--text-sm)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:brightness-110 active:brightness-90"
      style={{
        color: enabled ? "var(--foreground)" : "var(--muted-foreground)",
        background: enabled
          ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)"
          : "var(--background)",
        border: `1px solid ${enabled ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)" : "var(--input)"}`,
      }}
    >
      <Icon
        name={enabled ? "toggle-on" : "toggle-off"}
        style="solid"
        css={{ fontSize: "var(--text-base)" }}
      />
      {label}
    </button>
  );
}

function NavigationRuleControl({
  rule,
  onToggle,
  onToggleCrossOrigin,
}: {
  rule: NavigationBlockRule;
  onToggle: () => void;
  onToggleCrossOrigin: () => void;
}) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: "0.5rem" }}>
      <ToggleButton
        enabled={rule.enabled}
        onClick={onToggle}
        label={rule.enabled ? "Blocking" : "Allowed"}
      />
      {rule.enabled && (
        <ToggleButton
          enabled={rule.crossOriginOnly}
          onClick={onToggleCrossOrigin}
          label={rule.crossOriginOnly ? "Cross-origin only" : "All navigation"}
        />
      )}
    </div>
  );
}

function AppearanceSettings({ tabId }: { tabId: TabId }) {
  const customization = useTabCustomizationStore((s) => s.customizations.get(tabId));
  const tab = useTabsStore((s) => s.tabs.get(tabId));

  // Track local title override; null = use store value
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTitle = titleOverride ?? customization?.title ?? "";

  // Clear override when store confirms the save (title matches what we sent)
  const prevTitle = useRef(customization?.title);
  if (customization?.title !== prevTitle.current) {
    prevTitle.current = customization?.title;
    if (!saveTimeoutRef.current) {
      setTitleOverride(null);
    }
  }

  // Fetch current state on mount (populates store via event)
  useEffect(() => {
    window.chiaroscuro.sendCommand(TAB_CUSTOMIZATION_GET_STATE, { tabId }).catch(console.error);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [tabId]);

  const handleTitleChange = (value: string) => {
    setTitleOverride(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      sendCommand(TAB_CUSTOMIZATION_SET_TITLE, {
        tabId,
        title: value.trim() || null,
      });
    }, 300);
  };

  const handleFixedAddressToggle = () => {
    sendCommand(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
      tabId,
      disabled: !(customization?.fixedAddressDisabled ?? false),
    });
  };

  const fixedAddressDisabled = customization?.fixedAddressDisabled ?? false;

  return (
    <section id="tab-customization-appearance">
      <h2 style={settingsCategoryHeadingStyle}>Appearance</h2>

      <SettingItem
        label="Custom Title"
        description={`Override the tab title shown in the sidebar. Page title: ${tab?.title ?? "unknown"}`}
      >
        <input
          type="text"
          value={localTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder={tab?.title ?? "Enter a custom title..."}
          aria-label="Custom title"
          style={{ ...settingsInputStyle, maxWidth: "24rem" }}
        />
      </SettingItem>

      <SettingItem
        label="Allow Address Updates"
        description="When enabled, pinned tabs update their saved address as you browse. Normally pinned tabs keep a fixed address."
      >
        <ToggleButton
          enabled={fixedAddressDisabled}
          onClick={handleFixedAddressToggle}
          label={fixedAddressDisabled ? "Enabled" : "Disabled"}
        />
      </SettingItem>
    </section>
  );
}

function NavigationSettings({ tabId }: { tabId: TabId }) {
  const customization = useTabCustomizationStore((s) => s.customizations.get(tabId));

  const blockNavigate = customization?.blockNavigate ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockRedirect = customization?.blockRedirect ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockFrameNavigate = customization?.blockFrameNavigate ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockNewTabs = customization?.blockNewTabs ?? false;
  const blockNewWindows = customization?.blockNewWindows ?? false;

  function sendNav(updates: Partial<TabCustomization>) {
    sendCommand(TAB_CUSTOMIZATION_SET_NAVIGATION, {
      tabId,
      blockNavigate: updates.blockNavigate ?? blockNavigate,
      blockRedirect: updates.blockRedirect ?? blockRedirect,
      blockFrameNavigate: updates.blockFrameNavigate ?? blockFrameNavigate,
      blockNewTabs: updates.blockNewTabs ?? blockNewTabs,
      blockNewWindows: updates.blockNewWindows ?? blockNewWindows,
    });
  }

  return (
    <section id="tab-customization-navigation">
      <h2 style={settingsCategoryHeadingStyle}>Navigation</h2>

      <SettingItem
        label="Block Page Navigation"
        description="Prevent the page from navigating away via JavaScript or links (will-navigate)."
      >
        <NavigationRuleControl
          rule={blockNavigate}
          onToggle={() =>
            sendNav({
              blockNavigate: { ...blockNavigate, enabled: !blockNavigate.enabled },
            })
          }
          onToggleCrossOrigin={() =>
            sendNav({
              blockNavigate: { ...blockNavigate, crossOriginOnly: !blockNavigate.crossOriginOnly },
            })
          }
        />
      </SettingItem>

      <SettingItem
        label="Block Redirects"
        description="Prevent server-side redirects from changing the page URL (will-redirect)."
      >
        <NavigationRuleControl
          rule={blockRedirect}
          onToggle={() =>
            sendNav({
              blockRedirect: { ...blockRedirect, enabled: !blockRedirect.enabled },
            })
          }
          onToggleCrossOrigin={() =>
            sendNav({
              blockRedirect: { ...blockRedirect, crossOriginOnly: !blockRedirect.crossOriginOnly },
            })
          }
        />
      </SettingItem>

      <SettingItem
        label="Block Frame Navigation"
        description="Prevent iframes from navigating to new URLs (will-frame-navigate)."
      >
        <NavigationRuleControl
          rule={blockFrameNavigate}
          onToggle={() =>
            sendNav({
              blockFrameNavigate: { ...blockFrameNavigate, enabled: !blockFrameNavigate.enabled },
            })
          }
          onToggleCrossOrigin={() =>
            sendNav({
              blockFrameNavigate: {
                ...blockFrameNavigate,
                crossOriginOnly: !blockFrameNavigate.crossOriginOnly,
              },
            })
          }
        />
      </SettingItem>

      <SettingItem
        label="Block New Tabs"
        description="Prevent the page from opening new tabs (e.g. target=&quot;_blank&quot; links)."
      >
        <ToggleButton
          enabled={blockNewTabs}
          onClick={() => sendNav({ blockNewTabs: !blockNewTabs })}
          label={blockNewTabs ? "Blocking" : "Allowed"}
        />
      </SettingItem>

      <SettingItem
        label="Block New Windows"
        description="Prevent the page from opening new windows (e.g. window.open)."
      >
        <ToggleButton
          enabled={blockNewWindows}
          onClick={() => sendNav({ blockNewWindows: !blockNewWindows })}
          label={blockNewWindows ? "Blocking" : "Allowed"}
        />
      </SettingItem>
    </section>
  );
}

export default function TabCustomizationPage({ params }: BuiltInPageProps) {
  const tabId = (params.tabId ?? "") as TabId;
  const { scrollRef, activeCategory } = useScrollSpy("tab-customization");

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tabId) {
        e.preventDefault();
        sendCommand(TAB_CUSTOMIZATION_CLOSE, { tabId });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabId]);

  if (!tabId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted-foreground)",
          fontSize: "var(--text-sm)",
        }}
      >
        No tab specified.
      </div>
    );
  }

  return (
    <SettingsLayout
      icon="sliders"
      title="Tab Customization"
      categories={categories}
      scrollRef={scrollRef}
      activeCategory={activeCategory}
    >
      <AppearanceSettings tabId={tabId} />
      <NavigationSettings tabId={tabId} />
      <LocalWebAppSettings tabId={tabId} />

      <div style={{ paddingTop: "1rem" }}>
        <button
          type="button"
          onClick={() => sendCommand(TAB_CUSTOMIZATION_CLOSE, { tabId })}
          className="inline-flex items-center gap-2 cursor-pointer rounded-[var(--radius-sm)] px-4 py-2 font-[inherit] text-[length:var(--text-sm)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:brightness-110 active:brightness-90"
          style={{
            color: "var(--foreground)",
            background: "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)",
            border: "1px solid oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)",
          }}
        >
          <Icon name="arrow-left" style="solid" css={{ fontSize: "var(--text-xs)" }} />
          Done
        </button>
      </div>
    </SettingsLayout>
  );
}

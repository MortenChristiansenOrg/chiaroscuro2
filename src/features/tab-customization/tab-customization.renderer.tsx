import { useCallback, useEffect, useRef, useState } from "react";
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
  TAB_CUSTOMIZATION_CLOSE,
  TAB_CUSTOMIZATION_GET_STATE,
  TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED,
  TAB_CUSTOMIZATION_SET_TITLE,
  type TabCustomization,
} from "./tab-customization.shared";
import { useTabCustomizationStore } from "./tab-customization.store";

function sendCommand(name: string, payload: unknown) {
  void window.chiaroscuro.sendCommand(name, payload).catch(console.error);
}

const categories = [
  { id: "appearance", label: "Appearance" },
  { id: "local-web-app", label: "Local Web App" },
];

function AppearanceSettings({ tabId }: { tabId: TabId }) {
  const customization = useTabCustomizationStore((s) => s.customizations.get(tabId));
  const tab = useTabsStore((s) => s.tabs.get(tabId));
  const [localTitle, setLocalTitle] = useState(customization?.title ?? "");

  // Fetch current state on mount (or when tabId changes)
  useEffect(() => {
    let cancelled = false;
    window.chiaroscuro
      .sendCommand(TAB_CUSTOMIZATION_GET_STATE, { tabId })
      .then((result: unknown) => {
        if (cancelled) return;
        const state = result as TabCustomization;
        setLocalTitle(state.title ?? "");
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [tabId]);

  // Sync local title from store only when not actively editing (debounce idle)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!saveTimeoutRef.current) {
      setLocalTitle(customization?.title ?? "");
    }
  }, [customization?.title]);

  const handleTitleChange = useCallback(
    (value: string) => {
      setLocalTitle(value);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        sendCommand(TAB_CUSTOMIZATION_SET_TITLE, {
          tabId,
          title: value.trim() || null,
        });
      }, 300);
    },
    [tabId],
  );

  const handleFixedAddressToggle = useCallback(() => {
    sendCommand(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, {
      tabId,
      disabled: !(customization?.fixedAddressDisabled ?? false),
    });
  }, [tabId, customization?.fixedAddressDisabled]);

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
        <button
          type="button"
          onClick={handleFixedAddressToggle}
          className="inline-flex items-center gap-2 cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 font-[inherit] text-[length:var(--text-sm)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:brightness-110 active:brightness-90"
          style={{
            color: fixedAddressDisabled ? "var(--foreground)" : "var(--muted-foreground)",
            background: fixedAddressDisabled
              ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)"
              : "var(--background)",
            border: `1px solid ${fixedAddressDisabled ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)" : "var(--input)"}`,
          }}
        >
          <Icon
            name={fixedAddressDisabled ? "toggle-on" : "toggle-off"}
            style="solid"
            css={{ fontSize: "var(--text-base)" }}
          />
          {fixedAddressDisabled ? "Enabled" : "Disabled"}
        </button>
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

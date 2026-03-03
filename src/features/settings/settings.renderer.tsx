import { useCallback } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  SettingsLayout,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
  settingsColumnHeaderStyle,
  settingsIconButtonStyle,
  settingsInputStyle,
  useScrollSpy,
} from "../../renderer/src/components/SettingsLayout";
import type { SearchProvider } from "../command-palette/resolve-input";
import type { Settings } from "./settings.shared";
import { saveSettings, useSettingsStore } from "./settings.store";

// ── ProviderRow ─────────────────────────────────────────────────

function ProviderRow({
  provider,
  onUpdate,
  onRemove,
}: {
  provider: SearchProvider;
  onUpdate: (updated: SearchProvider) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "4rem 1fr 1fr auto",
        gap: "0.5rem",
        alignItems: "center",
      }}
    >
      <input
        type="text"
        value={provider.bang}
        onChange={(e) => onUpdate({ ...provider, bang: e.target.value })}
        placeholder="!g"
        aria-label="Bang keyword"
        style={settingsInputStyle}
      />
      <input
        type="text"
        value={provider.name}
        onChange={(e) => onUpdate({ ...provider, name: e.target.value })}
        placeholder="Google"
        aria-label="Provider name"
        style={settingsInputStyle}
      />
      <input
        type="text"
        value={provider.urlTemplate}
        onChange={(e) => onUpdate({ ...provider, urlTemplate: e.target.value })}
        placeholder="https://...?q={query}"
        aria-label="URL template"
        style={{
          ...settingsInputStyle,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
        }}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove provider"
        style={settingsIconButtonStyle}
      >
        <Icon name="xmark" style="solid" css={{ fontSize: "0.5rem" }} />
      </button>
    </div>
  );
}

// ── ProviderEditor ──────────────────────────────────────────────

function ProviderEditor({
  providers,
  onChange,
}: {
  providers: SearchProvider[];
  onChange: (providers: SearchProvider[]) => void;
}) {
  const handleUpdate = useCallback(
    (index: number, updated: SearchProvider) => {
      const next = [...providers];
      next[index] = updated;
      onChange(next);
    },
    [providers, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(providers.filter((_, i) => i !== index));
    },
    [providers, onChange],
  );

  const handleAdd = useCallback(() => {
    onChange([...providers, { bang: "", name: "", urlTemplate: "" }]);
  }, [providers, onChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {providers.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "4rem 1fr 1fr auto",
            gap: "0.5rem",
            paddingBottom: "0.25rem",
          }}
        >
          <span style={settingsColumnHeaderStyle}>Bang</span>
          <span style={settingsColumnHeaderStyle}>Name</span>
          <span style={settingsColumnHeaderStyle}>URL Template</span>
          <span style={{ ...settingsColumnHeaderStyle, width: "1.5rem" }} />
        </div>
      )}
      {providers.map((provider, i) => (
        <ProviderRow
          key={`${provider.bang}-${i}`}
          provider={provider}
          onUpdate={(updated) => handleUpdate(i, updated)}
          onRemove={() => handleRemove(i)}
        />
      ))}
      <button type="button" onClick={handleAdd} style={settingsAddButtonStyle}>
        <Icon name="plus" style="solid" css={{ fontSize: "0.5rem" }} />
        Add provider
      </button>
    </div>
  );
}

// ── SettingsContent ─────────────────────────────────────────────

function SearchSettings({
  settings,
  onSettingsChange,
}: {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}) {
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const lowerQuery = searchQuery.toLowerCase();

  const showSearch =
    !searchQuery ||
    "search".includes(lowerQuery) ||
    "search providers".includes(lowerQuery) ||
    "default search".includes(lowerQuery) ||
    "bang".includes(lowerQuery);

  if (searchQuery && !showSearch) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--muted-foreground)",
          fontSize: "var(--text-sm)",
        }}
      >
        No settings match &ldquo;{searchQuery}&rdquo;
      </div>
    );
  }

  return (
    <section id="settings-search">
      <h2 style={settingsCategoryHeadingStyle}>Search</h2>

      <SettingItem
        label="Search Providers"
        description="Configure search engines with bang keywords and URL templates. Use {query} as the placeholder."
      >
        <ProviderEditor
          providers={settings.searchProviders}
          onChange={(providers) => {
            const hasDefault = providers.some((p) => p.bang === settings.defaultSearchProviderId);
            const fallbackDefault = providers.find((p) => p.bang)?.bang ?? "";
            onSettingsChange({
              ...settings,
              searchProviders: providers,
              defaultSearchProviderId: hasDefault
                ? settings.defaultSearchProviderId
                : fallbackDefault,
            });
          }}
        />
      </SettingItem>

      <SettingItem
        label="Default Search Provider"
        description="Used when no bang prefix is specified."
      >
        <select
          value={settings.defaultSearchProviderId}
          onChange={(e) =>
            onSettingsChange({ ...settings, defaultSearchProviderId: e.target.value })
          }
          style={{
            padding: "0.375rem 0.5rem",
            fontSize: "var(--text-sm)",
            color: "var(--foreground)",
            background: "var(--background)",
            border: "1px solid var(--input)",
            borderRadius: "var(--radius-sm)",
            outline: "none",
            fontFamily: "inherit",
            minWidth: "12rem",
          }}
        >
          {settings.searchProviders
            .filter((p) => p.bang)
            .map((p) => (
              <option key={p.bang} value={p.bang}>
                {p.name || p.bang}
              </option>
            ))}
        </select>
      </SettingItem>
    </section>
  );
}

// ── SettingsPage (root) ─────────────────────────────────────────

const categories = [{ id: "search", label: "Search" }];

export default function SettingsPage(_props: { params: Record<string, string> }) {
  const settings = useSettingsStore((s) => s.settings);
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const setSearchQuery = useSettingsStore((s) => s.setSearchQuery);
  const { scrollRef, activeCategory } = useScrollSpy("settings");

  const handleSettingsChange = useCallback((updated: Settings) => {
    saveSettings(updated);
  }, []);

  if (!settings) {
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
        Loading settings...
      </div>
    );
  }

  return (
    <SettingsLayout
      icon="gear"
      title="Settings"
      categories={categories}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      scrollRef={scrollRef}
      activeCategory={activeCategory}
    >
      <SearchSettings settings={settings} onSettingsChange={handleSettingsChange} />
    </SettingsLayout>
  );
}

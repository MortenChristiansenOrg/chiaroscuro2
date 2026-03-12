import { Suspense } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  SettingsLayout,
  type SettingsSectionProps,
  getSettingsSections,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
  settingsColumnHeaderStyle,
  settingsIconButtonStyle,
  settingsInputStyle,
  settingsSelectStyle,
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
  const handleUpdate = (index: number, updated: SearchProvider) => {
    const next = [...providers];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(providers.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...providers, { id: crypto.randomUUID(), bang: "", name: "", urlTemplate: "" }]);
  };

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
          key={provider.id}
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

// ── SearchSettings (registered section) ─────────────────────────

export function SearchSettings({ searchQuery }: SettingsSectionProps) {
  const settings = useSettingsStore((s) => s.settings);
  const lowerQuery = searchQuery.toLowerCase();

  const showSearch =
    !searchQuery ||
    "search".includes(lowerQuery) ||
    "search providers".includes(lowerQuery) ||
    "default search".includes(lowerQuery) ||
    "bang".includes(lowerQuery);

  if (searchQuery && !showSearch) return null;
  if (!settings) return null;

  const handleChange = (updated: Settings) => {
    saveSettings(updated);
  };

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
            handleChange({
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
          onChange={(e) => handleChange({ ...settings, defaultSearchProviderId: e.target.value })}
          style={settingsSelectStyle}
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

// ── DeveloperSettings (registered section) ───────────────────────

export function DeveloperSettings({ searchQuery }: SettingsSectionProps) {
  const settings = useSettingsStore((s) => s.settings);
  const lowerQuery = searchQuery.toLowerCase();

  const showDeveloper =
    !searchQuery ||
    "developer".includes(lowerQuery) ||
    "debug server".includes(lowerQuery) ||
    "port".includes(lowerQuery);

  if (searchQuery && !showDeveloper) return null;
  if (!settings) return null;

  const handleChange = (updated: Settings) => {
    saveSettings(updated);
  };

  // In dev mode, debug server is always on
  const isDev = window.location.protocol !== "file:";

  return (
    <section id="settings-developer">
      <h2 style={settingsCategoryHeadingStyle}>Developer</h2>

      <SettingItem
        label="Debug Server"
        description="HTTP endpoint for inspecting app state, command/event history, and logs."
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "var(--text-sm)",
              color: "var(--foreground)",
            }}
          >
            <input
              type="checkbox"
              checked={isDev || settings.debugServer.enabled}
              disabled={isDev}
              onChange={(e) =>
                handleChange({
                  ...settings,
                  debugServer: { ...settings.debugServer, enabled: e.target.checked },
                })
              }
            />
            {isDev ? "Always on in dev mode" : "Enabled"}
          </label>
        </div>
      </SettingItem>

      <SettingItem
        label="Port"
        description="Port for the debug HTTP server. If unavailable, the next available port is used."
      >
        <input
          type="number"
          value={settings.debugServer.port}
          onChange={(e) => {
            const port = Number.parseInt(e.target.value, 10);
            if (port > 0 && port < 65536) {
              handleChange({
                ...settings,
                debugServer: { ...settings.debugServer, port },
              });
            }
          }}
          min={1}
          max={65535}
          style={{ ...settingsInputStyle, width: "8rem" }}
        />
      </SettingItem>
    </section>
  );
}

// ── SettingsPage (root) ─────────────────────────────────────────

export default function SettingsPage(_props: { params: Record<string, string> }) {
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const setSearchQuery = useSettingsStore((s) => s.setSearchQuery);
  const sections = getSettingsSections();
  const categories = sections.map((s) => ({ id: s.id, label: s.label }));
  const { scrollRef, activeCategory } = useScrollSpy("settings");

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
      {sections.map((section) => (
        <Suspense key={section.id} fallback={null}>
          <section.component searchQuery={searchQuery} />
        </Suspense>
      ))}
    </SettingsLayout>
  );
}

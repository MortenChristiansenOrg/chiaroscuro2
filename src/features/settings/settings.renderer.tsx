import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import type { SearchProvider } from "../command-palette/resolve-input";
import type { Settings } from "./settings.shared";
import { saveSettings, useSettingsStore } from "./settings.store";

// ── SettingsHeader ──────────────────────────────────────────────

function SettingsHeader() {
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const setSearchQuery = useSettingsStore((s) => s.setSearchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.5rem 2rem 1rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-lg)",
          fontWeight: 600,
          color: "var(--foreground)",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <Icon name="gear" style="solid" css={{ fontSize: "0.875rem" }} />
        Settings
      </h1>
      <div style={{ position: "relative" }}>
        <Icon
          name="magnifying-glass"
          style="solid"
          className="absolute"
          css={{
            fontSize: "0.625rem",
            left: "0.625rem",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted-foreground)",
            pointerEvents: "none",
            position: "absolute",
          }}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "14rem",
            padding: "0.375rem 0.625rem 0.375rem 1.75rem",
            fontSize: "var(--text-sm)",
            color: "var(--foreground)",
            background: "var(--background)",
            border: "1px solid var(--input)",
            borderRadius: "var(--radius-sm)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>
    </header>
  );
}

// ── SettingsCategoryNav ─────────────────────────────────────────

function SettingsCategoryNav({ activeCategory }: { activeCategory: string }) {
  const categories = [{ id: "search", label: "Search" }];

  return (
    <nav
      style={{
        width: "10rem",
        flexShrink: 0,
        paddingTop: "1rem",
        borderRight: "1px solid var(--border)",
      }}
    >
      {categories.map((cat) => (
        <a
          key={cat.id}
          href={`#settings-${cat.id}`}
          style={{
            display: "block",
            padding: "0.375rem 1rem",
            fontSize: "var(--text-sm)",
            color: activeCategory === cat.id ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: activeCategory === cat.id ? 600 : 400,
            textDecoration: "none",
            borderRight:
              activeCategory === cat.id ? "2px solid var(--foreground)" : "2px solid transparent",
            transition: "color var(--duration-fast)",
          }}
        >
          {cat.label}
        </a>
      ))}
    </nav>
  );
}

// ── ProviderEditor ──────────────────────────────────────────────

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
        style={inputStyle}
      />
      <input
        type="text"
        value={provider.name}
        onChange={(e) => onUpdate({ ...provider, name: e.target.value })}
        placeholder="Google"
        aria-label="Provider name"
        style={inputStyle}
      />
      <input
        type="text"
        value={provider.urlTemplate}
        onChange={(e) => onUpdate({ ...provider, urlTemplate: e.target.value })}
        placeholder="https://...?q={query}"
        aria-label="URL template"
        style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}
      />
      <button type="button" onClick={onRemove} aria-label="Remove provider" style={iconButtonStyle}>
        <Icon name="xmark" style="solid" css={{ fontSize: "0.5rem" }} />
      </button>
    </div>
  );
}

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
          <span style={columnHeaderStyle}>Bang</span>
          <span style={columnHeaderStyle}>Name</span>
          <span style={columnHeaderStyle}>URL Template</span>
          <span style={{ ...columnHeaderStyle, width: "1.5rem" }} />
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
      <button type="button" onClick={handleAdd} style={addButtonStyle}>
        <Icon name="plus" style="solid" css={{ fontSize: "0.5rem" }} />
        Add provider
      </button>
    </div>
  );
}

// ── SettingItem ─────────────────────────────────────────────────

function SettingItem({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.75rem 0" }}>
      <div style={{ marginBottom: "0.25rem" }}>
        <span
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            color: "var(--foreground)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--content-text-secondary)",
          marginBottom: "0.5rem",
        }}
      >
        {description}
      </div>
      {children}
    </div>
  );
}

// ── SettingsContent ─────────────────────────────────────────────

function SettingsContent({
  settings,
  onSettingsChange,
  scrollRef,
}: {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const lowerQuery = searchQuery.toLowerCase();

  const showSearch =
    !searchQuery ||
    "search".includes(lowerQuery) ||
    "search providers".includes(lowerQuery) ||
    "default search".includes(lowerQuery) ||
    "bang".includes(lowerQuery);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "1rem 2rem 2rem",
      }}
    >
      {showSearch && (
        <section id="settings-search">
          <h2 style={categoryHeadingStyle}>Search</h2>

          <SettingItem
            label="Search Providers"
            description="Configure search engines with bang keywords and URL templates. Use {query} as the placeholder."
          >
            <ProviderEditor
              providers={settings.searchProviders}
              onChange={(providers) =>
                onSettingsChange({ ...settings, searchProviders: providers })
              }
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
              style={selectStyle}
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
      )}

      {searchQuery && !showSearch && (
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
      )}
    </div>
  );
}

// ── SettingsPage (root) ─────────────────────────────────────────

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("search");

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("settings-", "");
            setActiveCategory(id);
          }
        }
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );

    const sections = container.querySelectorAll("section[id^='settings-']");
    for (const section of sections) observer.observe(section);

    return () => observer.disconnect();
  }, []);

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
    <div
      className="dark"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--content-bg)",
        color: "var(--foreground)",
      }}
    >
      <SettingsHeader />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <SettingsCategoryNav activeCategory={activeCategory} />
        <SettingsContent
          settings={settings}
          onSettingsChange={handleSettingsChange}
          scrollRef={scrollRef}
        />
      </div>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.375rem 0.5rem",
  fontSize: "var(--text-sm)",
  color: "var(--foreground)",
  background: "var(--background)",
  border: "1px solid var(--input)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  padding: "0.375rem 0.5rem",
  fontSize: "var(--text-sm)",
  color: "var(--foreground)",
  background: "var(--background)",
  border: "1px solid var(--input)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
  fontFamily: "inherit",
  minWidth: "12rem",
};

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.5rem",
  height: "1.5rem",
  border: "none",
  background: "transparent",
  color: "var(--muted-foreground)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "color var(--duration-fast), background var(--duration-fast)",
};

const addButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.375rem 0.75rem",
  fontSize: "var(--text-sm)",
  color: "var(--muted-foreground)",
  background: "transparent",
  border: "1px dashed var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontFamily: "inherit",
  alignSelf: "flex-start",
  transition: "color var(--duration-fast), border-color var(--duration-fast)",
};

const categoryHeadingStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted-foreground)",
  margin: "0 0 0.5rem",
  padding: "0.5rem 0",
  borderBottom: "1px solid var(--border)",
};

const columnHeaderStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 500,
  color: "var(--muted-foreground)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

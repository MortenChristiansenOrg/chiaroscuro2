import { useEffect } from "react";
import type { BuiltInPageProps } from "../../renderer/src/components/BuiltInPage";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  SettingsLayout,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
  useScrollSpy,
} from "../../renderer/src/components/SettingsLayout";
import {
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
} from "./domain-css.shared";
import { useDomainCssStore } from "./domain-css.store";

function sendCommand(name: string, payload: unknown) {
  void window.chiaroscuro.sendCommand(name, payload).catch(console.error);
}

const categories = [{ id: "css", label: "Custom CSS" }];

export function CssControls({ domain }: { domain: string }) {
  const state = useDomainCssStore((s) => s.states.get(domain));

  // Fetch initial state from main process
  useEffect(() => {
    window.chiaroscuro
      .sendCommand(DOMAIN_CSS_GET_STATE, { domain })
      .then((result: unknown) => {
        const s = result as { domain: string; enabled: boolean; hasFile: boolean };
        useDomainCssStore.setState((prev) => {
          const next = new Map(prev.states);
          next.set(s.domain, s);
          return { states: next };
        });
      })
      .catch(console.error);
  }, [domain]);

  const enabled = state?.enabled ?? false;
  const hasFile = state?.hasFile ?? false;

  const handleToggle = () => {
    sendCommand(DOMAIN_CSS_TOGGLE, { domain });
  };

  const handleEdit = () => {
    sendCommand(DOMAIN_CSS_EDIT, { domain });
  };

  const handleRemove = () => {
    sendCommand(DOMAIN_CSS_REMOVE, { domain });
  };

  return (
    <section id="domain-customization-css">
      <h2 style={settingsCategoryHeadingStyle}>Custom CSS</h2>

      <SettingItem
        label="Enable Custom CSS"
        description={`Inject custom CSS into all pages on ${domain}.`}
      >
        <button
          type="button"
          onClick={handleToggle}
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
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </SettingItem>

      <SettingItem
        label="Edit CSS File"
        description={
          hasFile
            ? "Open the CSS file in your system editor. Changes are applied automatically."
            : "Create a CSS file and open it in your system editor."
        }
      >
        <button
          type="button"
          onClick={handleEdit}
          style={settingsAddButtonStyle}
          className="cursor-pointer hover:!text-[var(--foreground)] hover:!border-[var(--foreground)] active:brightness-90"
        >
          <Icon name="pen-to-square" style="solid" css={{ fontSize: "0.5rem" }} />
          {hasFile ? "Edit CSS" : "Create & Edit CSS"}
        </button>
      </SettingItem>

      {hasFile && (
        <SettingItem
          label="Remove CSS File"
          description="Delete the custom CSS file and disable injection for this domain."
        >
          <button
            type="button"
            onClick={handleRemove}
            className="cursor-pointer hover:brightness-125 active:brightness-90"
            style={{
              ...settingsAddButtonStyle,
              color: "var(--destructive)",
              borderColor: "var(--destructive)",
            }}
          >
            <Icon name="trash" style="solid" css={{ fontSize: "0.5rem" }} />
            Remove CSS
          </button>
        </SettingItem>
      )}
    </section>
  );
}

export default function DomainCssPage({ params }: BuiltInPageProps) {
  const domain = params.domain ?? "";
  const { scrollRef, activeCategory } = useScrollSpy("domain-customization");

  if (!domain) {
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
        No domain specified.
      </div>
    );
  }

  return (
    <SettingsLayout
      icon="sliders"
      title={domain}
      categories={categories}
      scrollRef={scrollRef}
      activeCategory={activeCategory}
    >
      <CssControls domain={domain} />
    </SettingsLayout>
  );
}

import { useEffect } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import {
  DEFAULT_NAVIGATION_BLOCK_RULE,
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
  DOMAIN_NAVIGATION_GET_STATE,
  DOMAIN_NAVIGATION_SET,
  type DomainNavigationState,
  type NavigationBlockRule,
} from "./domain-css.shared";
import { useDomainCssStore } from "./domain-css.store";

function sendCommand(name: string, payload: unknown) {
  void window.chiaroscuro.sendCommand(name, payload).catch(console.error);
}

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
    <section id="domain-settings-css">
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

export function NavigationSettings({ domain }: { domain: string }) {
  const navState = useDomainCssStore((s) => s.navigationStates.get(domain));

  useEffect(() => {
    window.chiaroscuro
      .sendCommand(DOMAIN_NAVIGATION_GET_STATE, { domain })
      .then((result: unknown) => {
        const s = result as DomainNavigationState;
        useDomainCssStore.setState((prev) => {
          const next = new Map(prev.navigationStates);
          next.set(s.domain, s);
          return { navigationStates: next };
        });
      })
      .catch(console.error);
  }, [domain]);

  const blockNavigate = navState?.blockNavigate ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockRedirect = navState?.blockRedirect ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockFrameNavigate = navState?.blockFrameNavigate ?? DEFAULT_NAVIGATION_BLOCK_RULE;
  const blockNewTabs = navState?.blockNewTabs ?? false;
  const blockNewWindows = navState?.blockNewWindows ?? false;

  function sendNav(updates: Partial<DomainNavigationState>) {
    sendCommand(DOMAIN_NAVIGATION_SET, {
      domain,
      blockNavigate: updates.blockNavigate ?? blockNavigate,
      blockRedirect: updates.blockRedirect ?? blockRedirect,
      blockFrameNavigate: updates.blockFrameNavigate ?? blockFrameNavigate,
      blockNewTabs: updates.blockNewTabs ?? blockNewTabs,
      blockNewWindows: updates.blockNewWindows ?? blockNewWindows,
    });
  }

  return (
    <section id="domain-settings-navigation">
      <h2 style={settingsCategoryHeadingStyle}>Navigation</h2>

      <SettingItem
        label="Block Page Navigation"
        description="Prevent pages on this domain from navigating away via JavaScript or links."
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
        description="Prevent server-side redirects from changing the page URL."
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
        description="Prevent iframes from navigating to new URLs."
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
        description="Prevent pages on this domain from opening new tabs."
      >
        <ToggleButton
          enabled={blockNewTabs}
          onClick={() => sendNav({ blockNewTabs: !blockNewTabs })}
          label={blockNewTabs ? "Blocking" : "Allowed"}
        />
      </SettingItem>

      <SettingItem
        label="Block New Windows"
        description="Prevent pages on this domain from opening new windows."
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

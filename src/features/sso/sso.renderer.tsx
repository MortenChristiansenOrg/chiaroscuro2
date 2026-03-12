import {
  SettingItem,
  type SettingsSectionProps,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import { saveSsoSettings, useSsoStore } from "./sso.store";

function RestartBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.125rem 0.375rem",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        color: "var(--color-warning)",
        background: "oklch(from var(--color-warning) l c h / 0.12)",
        borderRadius: "var(--radius-sm)",
        marginLeft: "0.375rem",
      }}
    >
      restart required
    </span>
  );
}

export default function SsoSection({ searchQuery }: SettingsSectionProps) {
  const ssoState = useSsoStore((s) => s.state);
  const lowerQuery = searchQuery.toLowerCase();

  const showSection =
    !searchQuery ||
    "authentication".includes(lowerQuery) ||
    "sso".includes(lowerQuery) ||
    "single sign-on".includes(lowerQuery) ||
    "windows auth".includes(lowerQuery) ||
    "azure".includes(lowerQuery) ||
    "kerberos".includes(lowerQuery) ||
    "ntlm".includes(lowerQuery);

  if (searchQuery && !showSection) return null;
  if (!ssoState || !ssoState.isWindows) return null;

  const { settings, bootState } = ssoState;
  const windowsAuthChanged = settings.windowsAuth !== bootState.windowsAuth;
  const azureAdChanged = settings.azureAd !== bootState.azureAd;

  return (
    <section id="settings-authentication">
      <h2 style={settingsCategoryHeadingStyle}>Authentication</h2>

      <SettingItem
        label="Windows Authentication"
        description="Enable automatic NTLM/Kerberos sign-in using your Windows credentials for intranet and corporate sites."
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
              checked={settings.windowsAuth}
              onChange={(e) => saveSsoSettings({ ...settings, windowsAuth: e.target.checked })}
            />
            Enabled
          </label>
          {windowsAuthChanged && <RestartBadge />}
        </div>
      </SettingItem>

      <SettingItem
        label="Azure AD Single Sign-On"
        description="Enable SSO with Microsoft Entra ID (Azure AD) using your Windows primary account for Microsoft 365, Azure DevOps, and other Azure AD-protected sites."
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
              checked={settings.azureAd}
              onChange={(e) => saveSsoSettings({ ...settings, azureAd: e.target.checked })}
            />
            Enabled
          </label>
          {azureAdChanged && <RestartBadge />}
        </div>
      </SettingItem>
    </section>
  );
}

import { useEffect } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import {
  PERMISSIONS_GET_DOMAIN,
  PERMISSIONS_REVOKE,
  PERMISSIONS_SET,
  type PermissionDecision,
  getPermissionInfo,
} from "./permissions.shared";
import { usePermissionsStore } from "./permissions.store";

function sendCommand(name: string, payload: unknown) {
  void window.chiaroscuro.sendCommand(name, payload).catch(console.error);
}

// ── Permissions Section (for Domain Settings page) ───────────────

function PermissionRow({
  domain,
  permission,
  decision,
}: {
  domain: string;
  permission: string;
  decision: PermissionDecision;
}) {
  const info = getPermissionInfo(permission);
  const isAllowed = decision === "allow";

  const handleToggle = () => {
    sendCommand(PERMISSIONS_SET, {
      domain,
      permission,
      decision: isAllowed ? "deny" : "allow",
    });
  };

  const handleRevoke = () => {
    sendCommand(PERMISSIONS_REVOKE, { domain, permission });
  };

  return (
    <SettingItem label={info.label} description={isAllowed ? "Allowed" : "Denied"}>
      <div className="flex items-center" style={{ gap: "0.375rem" }}>
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-2 cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 font-[inherit] text-[length:var(--text-sm)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:brightness-110 active:brightness-90"
          style={{
            color: isAllowed ? "var(--foreground)" : "var(--muted-foreground)",
            background: isAllowed
              ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)"
              : "var(--background)",
            border: `1px solid ${isAllowed ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)" : "var(--input)"}`,
          }}
          data-tip={isAllowed ? "Switch to deny" : "Switch to allow"}
          aria-label={`${isAllowed ? "Deny" : "Allow"} ${info.label}`}
        >
          <Icon
            name={isAllowed ? "toggle-on" : "toggle-off"}
            style="solid"
            css={{ fontSize: "var(--text-base)" }}
          />
          {isAllowed ? "Allowed" : "Denied"}
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          className="cursor-pointer hover:brightness-125 active:brightness-90"
          style={{
            ...settingsAddButtonStyle,
            color: "var(--destructive)",
            borderColor: "var(--destructive)",
          }}
          data-tip="Revoke permission decision"
          aria-label={`Revoke ${info.label} decision`}
        >
          <Icon name="xmark" style="solid" css={{ fontSize: "0.5rem" }} />
          Revoke
        </button>
      </div>
    </SettingItem>
  );
}

export function PermissionsSection({ domain }: { domain: string }) {
  const permissions = usePermissionsStore((s) => s.domainPermissions.get(domain));

  // Fetch initial state from main process
  useEffect(() => {
    window.chiaroscuro
      .sendCommand(PERMISSIONS_GET_DOMAIN, { domain })
      .then((result: unknown) => {
        const r = result as { domain: string; permissions: Record<string, PermissionDecision> };
        usePermissionsStore.setState((prev) => {
          const next = new Map(prev.domainPermissions);
          if (Object.keys(r.permissions).length === 0) {
            next.delete(r.domain);
          } else {
            next.set(r.domain, r.permissions);
          }
          return { domainPermissions: next };
        });
      })
      .catch(console.error);
  }, [domain]);

  const entries = permissions ? Object.entries(permissions) : [];

  return (
    <section id="domain-settings-permissions">
      <h2 style={settingsCategoryHeadingStyle}>Permissions</h2>

      {entries.length === 0 ? (
        <div
          style={{
            padding: "1rem 0",
            color: "var(--muted-foreground)",
            fontSize: "var(--text-sm)",
          }}
        >
          No permission decisions stored for this domain.
        </div>
      ) : (
        entries.map(([permission, decision]) => (
          <PermissionRow
            key={permission}
            domain={domain}
            permission={permission}
            decision={decision}
          />
        ))
      )}
    </section>
  );
}

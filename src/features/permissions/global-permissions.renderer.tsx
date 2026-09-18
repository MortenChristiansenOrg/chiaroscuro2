import { useEffect, useState } from "react";
import {
  SettingItem,
  settingsAddButtonStyle,
  settingsCategoryHeadingStyle,
  settingsSelectStyle,
} from "../../renderer/src/components/SettingsLayout";
import {
  getPermissionInfo,
  PERMISSIONS_RESET_GLOBAL,
  PERMISSIONS_SET_GLOBAL,
  type PermissionDecision,
} from "./permissions.shared";
import { loadGlobalPermissions, usePermissionsStore } from "./permissions.store";

export function GlobalPermissionRow({
  permission,
  decision,
}: {
  permission: string;
  decision?: PermissionDecision;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { label } = getPermissionInfo(permission);

  async function save(value: string) {
    setPending(true);
    setError("");
    try {
      if (value) {
        await window.chiaroscuro.sendCommand(PERMISSIONS_SET_GLOBAL, {
          permission,
          decision: value,
        });
      } else {
        await window.chiaroscuro.sendCommand(PERMISSIONS_RESET_GLOBAL, { permission });
      }
    } catch {
      setError("Could not save this permission. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingItem
      label={label}
      description={
        decision
          ? `${decision === "allow" ? "Allowed" : "Denied"} for every domain.`
          : "Use saved site decisions, or ask when a site requests access."
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Global ${label} permission`}
          value={decision ?? ""}
          disabled={pending}
          onChange={(event) => void save(event.target.value)}
          style={settingsSelectStyle}
        >
          <option value="">No global choice</option>
          <option value="allow">Allow everywhere</option>
          <option value="deny">Deny everywhere</option>
        </select>
        {decision && (
          <button
            type="button"
            aria-label={`Reset global ${label} permission`}
            disabled={pending}
            onClick={() => void save("")}
            style={settingsAddButtonStyle}
          >
            Reset
          </button>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </SettingItem>
  );
}

export function GlobalPermissionsSection({
  searchQuery = "",
  showEmptyState = false,
}: {
  searchQuery?: string;
  showEmptyState?: boolean;
}) {
  const permissions = usePermissionsStore((s) => s.globalPermissions);
  const available = usePermissionsStore((s) => s.availablePermissions);
  const loaded = usePermissionsStore((s) => s.globalLoaded);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadGlobalPermissions().catch(() => setError("Could not load global permissions."));
  }, []);

  const query = searchQuery.trim().toLowerCase();
  const entries = available.filter((permission) =>
    `global permissions ${permission} ${getPermissionInfo(permission).label} ${permission.includes("clipboard") ? "copy paste" : ""}`
      .toLowerCase()
      .includes(query),
  );

  if (!entries.length)
    return showEmptyState ? (
      <p style={{ color: "var(--muted-foreground)" }}>
        No settings match &ldquo;{searchQuery}&rdquo;
      </p>
    ) : null;

  return (
    <section id="settings-permissions">
      <h2 style={settingsCategoryHeadingStyle}>Global permissions</h2>
      <p style={{ color: "var(--content-text-secondary)", fontSize: "var(--text-sm)" }}>
        Apply a choice to every domain. Global choices take priority over site decisions and appear
        read only in domain settings. Reset a choice to use site decisions again.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !loaded ? (
        <p>Loading permissions...</p>
      ) : (
        entries.map((permission) => (
          <GlobalPermissionRow
            key={permission}
            permission={permission}
            decision={permissions[permission]}
          />
        ))
      )}
    </section>
  );
}

import { useEffect, useId, useState } from "react";
import {
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
  decision: PermissionDecision;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const { label } = getPermissionInfo(permission);

  async function save(value?: PermissionDecision) {
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
    <div className="border-b border-[var(--border)] py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={id} className="min-w-0 flex-[1_1_12rem] text-[length:var(--text-sm)]">
          {label}
        </label>
        <select
          id={id}
          aria-label={`Global ${label} permission`}
          value={decision}
          disabled={pending}
          onChange={(event) => void save(event.target.value as PermissionDecision)}
          style={settingsSelectStyle}
        >
          <option value="allow">Allow everywhere</option>
          <option value="deny">Deny everywhere</option>
        </select>
        <button
          type="button"
          aria-label={`Reset global ${label} permission`}
          disabled={pending}
          onClick={() => void save()}
          style={settingsAddButtonStyle}
        >
          Reset
        </button>
      </div>
      {permission === "unknown" && (
        <p className="mt-2 text-[length:var(--text-sm)] text-[var(--muted-foreground)]">
          Applies to requests Electron could not identify. Reset to remove this global choice.
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function GlobalPermissionAddForm({ permissions }: { permissions: string[] }) {
  const [selected, setSelected] = useState("");
  const [decision, setDecision] = useState<PermissionDecision>("allow");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  // Selection can disappear after search, an add, or a change in another window.
  const permission = permissions.includes(selected) ? selected : "";

  async function add() {
    if (!permission || pending) return;
    setPending(true);
    setError("");
    try {
      await window.chiaroscuro.sendCommand(PERMISSIONS_SET_GLOBAL, { permission, decision });
      setSelected("");
    } catch {
      setError("Could not add this permission. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
      className="mb-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1">
          <label htmlFor={`${id}-permission`} className="text-[length:var(--text-sm)]">
            Permission
          </label>
          <select
            id={`${id}-permission`}
            aria-label="Permission to configure"
            value={permission}
            onChange={(event) => setSelected(event.target.value)}
            disabled={pending}
            style={{ ...settingsSelectStyle, minWidth: 0, width: "100%" }}
          >
            <option value="">Choose a permission…</option>
            {permissions.map((key) => (
              <option key={key} value={key}>
                {getPermissionInfo(key).label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-decision`} className="text-[length:var(--text-sm)]">
            Global choice
          </label>
          <select
            id={`${id}-decision`}
            value={decision}
            onChange={(event) => setDecision(event.target.value as PermissionDecision)}
            disabled={pending}
            style={settingsSelectStyle}
          >
            <option value="allow">Allow everywhere</option>
            <option value="deny">Deny everywhere</option>
          </select>
        </div>
        <button
          type="submit"
          className="disabled:opacity-50"
          disabled={!permission || pending}
          style={{ ...settingsAddButtonStyle, alignSelf: "flex-end" }}
        >
          Add permission
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </form>
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
  function matches(permission: string) {
    return `global permissions ${permission} ${getPermissionInfo(permission).label} ${permission.includes("clipboard") ? "copy paste" : ""}`
      .toLowerCase()
      .includes(query);
  }
  function byLabel(a: string, b: string) {
    return getPermissionInfo(a).label.localeCompare(getPermissionInfo(b).label);
  }
  const configured = Object.entries(permissions)
    .filter(([key]) => matches(key))
    .sort(([a], [b]) => byLabel(a, b));
  const unconfigured = available
    .filter((key) => key !== "unknown" && !Object.hasOwn(permissions, key) && matches(key))
    .sort(byLabel);

  if (query && !configured.length && !unconfigured.length)
    return showEmptyState ? (
      <p style={{ color: "var(--muted-foreground)" }}>
        No settings match &ldquo;{searchQuery}&rdquo;
      </p>
    ) : null;

  return (
    <section id="settings-permissions">
      <h2 style={settingsCategoryHeadingStyle}>Global permissions</h2>
      <p style={{ color: "var(--content-text-secondary)", fontSize: "var(--text-sm)" }}>
        Choose a permission to allow or deny everywhere. Global choices appear read only in domain
        settings. Reset restores site decisions.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !loaded ? (
        <p>Loading permissions...</p>
      ) : (
        <>
          {unconfigured.length > 0 && <GlobalPermissionAddForm permissions={unconfigured} />}
          {configured.length ? (
            configured.map(([permission, decision]) => (
              <GlobalPermissionRow key={permission} permission={permission} decision={decision} />
            ))
          ) : (
            <p className="text-[length:var(--text-sm)] text-[var(--muted-foreground)]">
              {Object.keys(permissions).length
                ? "No configured permissions match this search."
                : "No global permissions configured. Sites use their own permission decisions."}
            </p>
          )}
        </>
      )}
    </section>
  );
}

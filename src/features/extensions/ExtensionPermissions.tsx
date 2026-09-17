import type { InstalledExtension } from "./extensions.shared";
import { extensionCommand } from "./extensions.store";
import "./extensions.css";

const permissionDescriptions: Record<string, [string, string]> = {
  tabs: ["Tabs and forms", "Read tab information"],
  activeTab: ["Tabs and forms", "Access the active tab when you use the extension"],
  scripting: ["Tabs and forms", "Run scripts on permitted websites to fill forms"],
  webNavigation: ["Tabs and forms", "Observe page navigation"],
  storage: ["Vault and background activity", "Store vault data and preferences"],
  unlimitedStorage: ["Vault and background activity", "Store data without a fixed size limit"],
  alarms: ["Vault and background activity", "Schedule tasks"],
  idle: ["Vault and background activity", "Detect device inactivity"],
  offscreen: ["Vault and background activity", "Run tasks in hidden documents"],
  clipboardRead: ["Clipboard", "Read clipboard content"],
  clipboardWrite: ["Clipboard", "Copy content to the clipboard"],
  contextMenus: ["Browser integration", "Add page menu items"],
  notifications: ["Browser integration", "Show notifications"],
  sidePanel: ["Browser integration", "Use a side panel where supported"],
  webRequest: ["Network requests", "Observe requests on permitted websites"],
  webRequestAuthProvider: ["Network requests", "Respond to website authentication challenges"],
};
function groupPermissions(permissions: string[]): [string, string[]][] {
  const groups = new Map<string, Set<string>>();
  for (const permission of permissions) {
    let description = permissionDescriptions[permission];
    if (["<all_urls>", "*://*/*", "http://*/*", "https://*/*"].includes(permission)) {
      description = ["Website access", "Read and change data on all websites"];
    } else if (permission.startsWith("file:")) {
      description = ["Website access", "Access local files where permitted"];
    } else if (permission.includes("://")) {
      description = ["Website access", `Read and change data on ${permission}`];
    }
    const [group, label] = description ?? ["Other access", `Request ${permission} access`];
    const entries = groups.get(group) ?? new Set<string>();
    entries.add(label);
    if (permission === "<all_urls>") entries.add("Access local files where permitted");
    groups.set(group, entries);
  }
  return [...groups].map(([group, entries]) => [group, [...entries]]);
}

export function ExtensionPermissions({ extension }: { extension: InstalledExtension }) {
  const review = extension.review;
  if (!review) return null;
  const installing = extension.installed === false;
  const updating = !installing && !!extension.updateVersion;
  return (
    <section aria-label="Extension permissions" className="extension-permissions">
      <div>
        <h3>
          {installing
            ? "Review permissions"
            : updating
              ? "Additional access required"
              : "Review extension access"}
        </h3>
        <p className="extension-secondary">
          {extension.name}
          {extension.updateVersion ? ` ${extension.updateVersion}` : ""}{" "}
          {updating ? "requests the following new access:" : "requests the following access:"}
        </p>
      </div>
      <ul className="extension-permission-list">
        {groupPermissions(review.permissions).map(([group, descriptions]) => (
          <li key={group}>
            <h4>{group}</h4>
            <p className="extension-secondary">{descriptions.join("; ")}.</p>
          </li>
        ))}
      </ul>
      <details className="extension-permission-details">
        <summary>Exact permission names</summary>
        <ul>
          {review.permissions.map((permission) => (
            <li key={permission}>
              <code>{permission}</code>
            </li>
          ))}
        </ul>
      </details>
      <p className="extension-secondary">
        {installing
          ? "Only install if you trust this extension with the access above."
          : "New access is not granted until you approve."}
      </p>
      <button
        type="button"
        disabled={extension.busy}
        className="extension-button extension-button-primary"
        onClick={() =>
          void extensionCommand("extensions:approve", {
            extensionId: extension.id,
            token: review.token,
          })
        }
      >
        {extension.busy
          ? "Applying approval…"
          : installing
            ? "Approve and install"
            : "Approve permissions"}
      </button>
    </section>
  );
}

import type { InstalledExtension } from "./extensions.shared";
import { extensionCommand } from "./extensions.store";
import { extensionButtonStyle } from "./extensions.styles";
export function ExtensionPermissions({ extension }: { extension: InstalledExtension }) {
  const review = extension.review;
  if (!review) return null;
  return (
    <section aria-label="Extension permissions" style={{ marginTop: "1rem" }}>
      <p style={{ fontWeight: 500 }}>
        Review {extension.installed === false ? "installation" : "permissions"}
      </p>
      <p>
        Bitwarden can read and change website content, access your clipboard, and store vault data
        on this device. Only approve if you trust Bitwarden.
      </p>
      <details>
        <summary>
          Requested access
          {extension.updateVersion && extension.installed ? " added by this update" : ""}
        </summary>
        <ul>
          {review.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </details>
      <button
        type="button"
        disabled={extension.busy}
        style={extensionButtonStyle}
        onClick={() =>
          void extensionCommand("extensions:approve", {
            extensionId: extension.id,
            token: review.token,
          })
        }
      >
        Approve {extension.installed === false ? "and install" : "permissions"}
      </button>
      <p style={{ color: "var(--content-text-secondary)" }}>
        Decline by{" "}
        {extension.installed === false
          ? "cancelling installation"
          : "leaving this unapproved or removing the extension"}
        . New access is not granted until you approve.
      </p>
    </section>
  );
}

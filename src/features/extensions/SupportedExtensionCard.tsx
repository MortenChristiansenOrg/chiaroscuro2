import { useState } from "react";
import { ExtensionCardHeader } from "./ExtensionCardHeader";
import { ExtensionPermissions } from "./ExtensionPermissions";
import { BITWARDEN_ID, type InstalledExtension } from "./extensions.shared";
import { extensionCommand } from "./extensions.store";
import "./extensions.css";

export function SupportedExtensionCard({ extension }: { extension?: InstalledExtension }) {
  const [downloading, setDownloading] = useState(false);
  const busy = downloading || extension?.busy;
  const review = extension?.review;
  return (
    <article aria-label="Install Bitwarden" className="extension-card">
      <ExtensionCardHeader
        name="Bitwarden Password Manager"
        description="Official extension · Chrome Web Store"
      />
      <p>Keep your passwords in Bitwarden and fill logins from its toolbar popup.</p>
      {extension?.error && (
        <p role="alert" className="extension-error">
          {extension.error}
        </p>
      )}
      {busy ? (
        <div className="extension-notice" role="status">
          <strong>{review ? "Installing Bitwarden…" : "Downloading Bitwarden…"}</strong>
          <p>
            {review
              ? "Applying your approval and preparing the extension."
              : "Preparing the permission review. Nothing is installed until you approve."}
          </p>
        </div>
      ) : review ? (
        <ExtensionPermissions extension={extension} />
      ) : (
        <div className="extension-install-action">
          <button
            type="button"
            className="extension-button extension-button-primary"
            onClick={async () => {
              setDownloading(true);
              try {
                await extensionCommand("extensions:install", {
                  extensionId: BITWARDEN_ID,
                  name: "Bitwarden Password Manager",
                });
              } finally {
                setDownloading(false);
              }
            }}
          >
            {extension?.error ? "Retry download" : "Review and install"}
          </button>
          <p className="extension-secondary">
            Download, review its access, then choose whether to install.
          </p>
        </div>
      )}
      {extension && !busy && (
        <div className="extension-actions">
          <button
            type="button"
            className="extension-button"
            onClick={() =>
              void extensionCommand("extensions:uninstall", { extensionId: extension.id })
            }
          >
            Cancel installation
          </button>
        </div>
      )}
    </article>
  );
}

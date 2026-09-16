import { useState } from "react";
import { ExtensionCardHeader } from "./ExtensionCardHeader";
import { ExtensionEnabledToggle } from "./ExtensionEnabledToggle";
import { ExtensionPermissions } from "./ExtensionPermissions";
import { BITWARDEN_ID, type InstalledExtension } from "./extensions.shared";
import { extensionCommand } from "./extensions.store";
import "./extensions.css";

export function InstalledExtensionCard({ extension }: { extension: InstalledExtension }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const supported = extension.id === BITWARDEN_ID;
  return (
    <article className="extension-card" aria-label={extension.name}>
      <ExtensionCardHeader
        id={extension.id}
        iconUrl={extension.iconUrl}
        name={extension.name}
        description={`v${extension.version} · ${extension.loaded ? "Enabled" : extension.enabled ? "Not running" : "Disabled"}`}
      >
        <ExtensionEnabledToggle
          id={extension.id}
          enabled={extension.enabled}
          busy={extension.busy}
        />
      </ExtensionCardHeader>
      {extension.error && (
        <p role="alert" className="extension-error">
          {extension.error}
        </p>
      )}
      {extension.restartRequired && (
        <div className="extension-notice" role="status">
          <strong>Update ready · Version {extension.updateVersion}</strong>
          <p>Close and reopen Chiaroscuro to apply it. Your vault and settings are kept.</p>
        </div>
      )}
      {supported ? (
        <div>
          <p>Updates are checked automatically, even while disabled.</p>
          <p className="extension-secondary">
            {extension.lastChecked
              ? `Last checked ${new Date(extension.lastChecked).toLocaleString()}.`
              : "No successful update check yet."}
          </p>
        </div>
      ) : (
        <p>This legacy extension is unsupported and does not receive updates.</p>
      )}
      <ExtensionPermissions extension={extension} />
      <div className="extension-actions">
        {extension.loaded && extension.action?.popup && (
          <button
            type="button"
            className="extension-button extension-button-primary"
            disabled={extension.busy}
            onClick={() =>
              void extensionCommand("extensions:open-popup", { extensionId: extension.id })
            }
          >
            Open {supported ? "Bitwarden" : "extension"}
          </button>
        )}
        {supported && (
          <button
            type="button"
            className="extension-button"
            disabled={extension.busy}
            onClick={() =>
              void extensionCommand("extensions:check-updates", { extensionId: extension.id })
            }
          >
            Check now
          </button>
        )}
        <button
          type="button"
          className="extension-button"
          disabled={extension.busy}
          onClick={() => setConfirmRemove(true)}
        >
          Remove
        </button>
        {extension.busy && (
          <span role="status" className="extension-secondary">
            Updating extension status…
          </span>
        )}
      </div>
      {confirmRemove && (
        <section aria-label="Confirm extension removal" className="extension-remove-confirmation">
          <h3>Remove {extension.name}?</h3>
          <p>
            Local vault data and settings are retained for reinstalling.
            {supported && " This does not delete your Bitwarden account."}
          </p>
          <div className="extension-actions">
            <button
              type="button"
              className="extension-button"
              disabled={extension.busy}
              onClick={() =>
                void extensionCommand("extensions:uninstall", { extensionId: extension.id })
              }
            >
              Confirm removal
            </button>
            <button
              type="button"
              className="extension-button"
              onClick={() => setConfirmRemove(false)}
            >
              Keep extension
            </button>
          </div>
        </section>
      )}
    </article>
  );
}

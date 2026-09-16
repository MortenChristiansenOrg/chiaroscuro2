import { useState } from "react";
import { ExtensionEnabledToggle } from "./ExtensionEnabledToggle";
import { ExtensionIcon } from "./ExtensionIcon";
import { ExtensionPermissions } from "./ExtensionPermissions";
import { BITWARDEN_ID, type InstalledExtension } from "./extensions.shared";
import { extensionCommand } from "./extensions.store";
import { extensionButtonStyle, extensionCardStyle } from "./extensions.styles";
export function InstalledExtensionCard({ extension }: { extension: InstalledExtension }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const supported = extension.id === BITWARDEN_ID;
  const installed = extension.installed !== false;
  return (
    <article style={extensionCardStyle} aria-label={extension.name}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <ExtensionIcon url={extension.iconUrl} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{extension.name}</div>
          <div style={{ color: "var(--content-text-secondary)" }}>
            {installed
              ? `v${extension.version} · ${extension.loaded ? "Enabled" : extension.enabled ? "Not running" : "Disabled"}`
              : "Ready to review"}
          </div>
        </div>
        {installed && (
          <ExtensionEnabledToggle
            id={extension.id}
            enabled={extension.enabled}
            busy={extension.busy}
          />
        )}
      </div>
      {extension.error && (
        <p role="alert" style={{ color: "var(--destructive-foreground)" }}>
          {extension.error}
        </p>
      )}
      {extension.busy && <p role="status">Working…</p>}
      {extension.restartRequired && (
        <p role="status">
          Version {extension.updateVersion} is ready. Close and reopen Chiaroscuro to apply it
          safely.
        </p>
      )}
      {installed && supported && (
        <p style={{ color: "var(--content-text-secondary)", marginTop: "0.75rem" }}>
          Updates are checked automatically, including while disabled.{" "}
          {extension.lastChecked
            ? `Last checked ${new Date(extension.lastChecked).toLocaleString()}.`
            : "No successful update check yet."}
        </p>
      )}
      {!supported && <p>This legacy extension is unsupported and does not receive updates.</p>}
      <ExtensionPermissions extension={extension} />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {supported && (installed || !extension.review) && (
          <button
            type="button"
            style={extensionButtonStyle}
            disabled={extension.busy}
            onClick={() =>
              void extensionCommand("extensions:check-updates", { extensionId: extension.id })
            }
          >
            {installed ? "Check now" : "Retry download"}
          </button>
        )}
        <button
          type="button"
          style={extensionButtonStyle}
          disabled={extension.busy}
          onClick={() => setConfirmRemove(true)}
        >
          {installed ? "Remove" : "Cancel installation"}
        </button>
      </div>
      {confirmRemove && (
        <fieldset aria-label="Confirm extension removal" style={{ marginTop: "1rem" }}>
          <p>
            Remove {extension.name}? Local vault data and settings are retained for reinstalling.
            {supported && " This does not delete your Bitwarden account."}
          </p>
          <button
            type="button"
            style={extensionButtonStyle}
            disabled={extension.busy}
            onClick={() =>
              void extensionCommand("extensions:uninstall", { extensionId: extension.id })
            }
          >
            Confirm removal
          </button>{" "}
          <button
            type="button"
            style={extensionButtonStyle}
            onClick={() => setConfirmRemove(false)}
          >
            Keep extension
          </button>
        </fieldset>
      )}
    </article>
  );
}

import { PageHeader } from "../../renderer/src/components/SettingsLayout";
import { BITWARDEN_ID } from "./extensions.shared";
import { useExtensionsStore } from "./extensions.store";
import { InstalledExtensionCard } from "./InstalledExtensionCard";
import { SupportedExtensionCard } from "./SupportedExtensionCard";
import "./extensions.css";

export default function ExtensionsPage() {
  const extensions = useExtensionsStore((state) => state.extensions);
  const error = useExtensionsStore((state) => state.error);
  const bitwarden = extensions.find((extension) => extension.id === BITWARDEN_ID);
  return (
    <div
      className="dark"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--content-bg)",
        color: "var(--foreground)",
      }}
    >
      <PageHeader title="Extensions" icon="puzzle-piece" />
      <div className="extensions-content">
        <p className="extension-secondary">
          Add Bitwarden to manage your passwords and fill logins across your tabs.
        </p>
        {error && !extensions.some((extension) => extension.error === error) && (
          <p role="alert" className="extension-error">
            {error}
          </p>
        )}
        {(!bitwarden || bitwarden.installed === false) && (
          <SupportedExtensionCard extension={bitwarden} />
        )}
        {extensions
          .filter((extension) => extension.installed !== false)
          .map((extension) => (
            <InstalledExtensionCard key={extension.id} extension={extension} />
          ))}
        <details className="extensions-compatibility">
          <summary>Supported Bitwarden features</summary>
          <p>
            Password sign-in, vault management, password generation, and filling from the toolbar
            popup are supported. Passkeys, biometric unlock, inline suggestions, automatic filling,
            and extension shortcuts are not supported.
          </p>
        </details>
      </div>
    </div>
  );
}

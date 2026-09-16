import { PageHeader } from "../../renderer/src/components/SettingsLayout";
import { useExtensionsStore } from "./extensions.store";
import { InstalledExtensionCard } from "./InstalledExtensionCard";
import { SupportedExtensionCard } from "./SupportedExtensionCard";
export default function ExtensionsPage() {
  const extensions = useExtensionsStore((state) => state.extensions);
  const error = useExtensionsStore((state) => state.error);
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
      <div
        style={{
          padding: "1.5rem 2rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <p style={{ fontSize: "var(--text-sm)", color: "var(--content-text-secondary)" }}>
          Bitwarden is the supported extension. Password sign-in, vault management and popup filling
          are supported. Passkeys, biometric unlock, inline suggestions, automatic filling and
          extension shortcuts are not supported.
        </p>
        {error && (
          <p role="alert" style={{ color: "var(--destructive-foreground)" }}>
            {error}
          </p>
        )}
        {!extensions.some((extension) => extension.id === "nngceckbapebfimnlniiiahkandclblb") && (
          <SupportedExtensionCard />
        )}
        {extensions.map((extension) => (
          <InstalledExtensionCard key={extension.id} extension={extension} />
        ))}
      </div>
    </div>
  );
}

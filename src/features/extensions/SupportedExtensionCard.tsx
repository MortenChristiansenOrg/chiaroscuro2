import { useState } from "react";
import { ExtensionIcon } from "./ExtensionIcon";
import { extensionCommand } from "./extensions.store";
import { extensionButtonStyle, extensionCardStyle } from "./extensions.styles";
export function SupportedExtensionCard() {
  const [busy, setBusy] = useState(false);
  return (
    <article aria-label="Install Bitwarden" style={extensionCardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <ExtensionIcon />
        <div style={{ flex: 1 }}>
          <strong>Bitwarden Password Manager</strong>
          <p>
            Official Chrome Web Store extension. Sign in, manage passwords, and fill logins from its
            toolbar popup.
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        style={extensionButtonStyle}
        onClick={async () => {
          setBusy(true);
          try {
            await extensionCommand("extensions:install", {
              extensionId: "nngceckbapebfimnlniiiahkandclblb",
              name: "Bitwarden Password Manager",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Downloading…" : "Review installation"}
      </button>
    </article>
  );
}

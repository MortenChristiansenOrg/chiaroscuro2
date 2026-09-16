import { extensionCommand } from "./extensions.store";
import "./extensions.css";

export function ExtensionEnabledToggle({
  id,
  enabled,
  busy,
}: {
  id: string;
  enabled: boolean;
  busy?: boolean;
}) {
  return (
    <label className="extension-enabled-toggle">
      <input
        type="checkbox"
        role="switch"
        aria-checked={enabled}
        checked={enabled}
        disabled={busy}
        aria-label="Enable extension"
        onChange={(event) =>
          void extensionCommand("extensions:set-enabled", {
            extensionId: id,
            enabled: event.target.checked,
          })
        }
      />
      <span className="extension-switch-track" aria-hidden="true">
        <span />
      </span>
      <span>{enabled ? "Enabled" : "Disabled"}</span>
    </label>
  );
}

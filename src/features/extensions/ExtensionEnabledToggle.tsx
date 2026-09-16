import { extensionCommand } from "./extensions.store";
import "./extensions.css";

export function ExtensionEnabledToggle({
  id,
  name,
  enabled,
  busy,
}: {
  id: string;
  name: string;
  enabled: boolean;
  busy?: boolean;
}) {
  return (
    <label className="extension-enabled-toggle">
      <input
        type="checkbox"
        // biome-ignore lint/a11y/useAriaPropsForRole: native checkbox checked supplies the switch state.
        role="switch"
        checked={enabled}
        disabled={busy}
        aria-label={`Enable ${name}`}
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

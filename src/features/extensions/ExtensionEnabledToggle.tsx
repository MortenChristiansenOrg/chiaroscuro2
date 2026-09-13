import { extensionCommand } from "./extensions.store";
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
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        cursor: busy ? "default" : "pointer",
        position: "relative",
      }}
    >
      <input
        className="peer"
        type="checkbox"
        checked={enabled}
        disabled={busy}
        aria-label="Enabled"
        style={{
          position: "absolute",
          opacity: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          cursor: "inherit",
        }}
        onChange={(event) =>
          void extensionCommand("extensions:set-enabled", {
            extensionId: id,
            enabled: event.target.checked,
          })
        }
      />
      <span
        className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
        style={{
          display: "inline-block",
          width: "2rem",
          height: "1.125rem",
          borderRadius: "var(--radius-full)",
          background: enabled ? "var(--primary)" : "var(--muted)",
          position: "relative",
          opacity: busy ? 0.5 : 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "0.125rem",
            left: enabled ? "1rem" : "0.125rem",
            width: "0.875rem",
            height: "0.875rem",
            borderRadius: "var(--radius-full)",
            background: enabled ? "var(--primary-foreground)" : "var(--foreground)",
          }}
        />
      </span>
      <span>Enabled</span>
    </label>
  );
}

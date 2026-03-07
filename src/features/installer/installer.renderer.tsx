import { Icon } from "../../renderer/src/components/Icon";
import {
  INSTALLER_ALLOW_PROTOCOL,
  INSTALLER_APPLY_UPDATE,
  INSTALLER_DENY_PROTOCOL,
  INSTALLER_DISMISS_UPDATE,
} from "./installer.shared";
import { useInstallerStore } from "./installer.store";

function sendCommand(name: string, payload: unknown) {
  return window.chiaroscuro.sendCommand(name, payload);
}

export function UpdateNotification() {
  const version = useInstallerStore((s) => s.pendingUpdateVersion);
  const downloaded = useInstallerStore((s) => s.updateDownloaded);
  const dismissed = useInstallerStore((s) => s.updateDismissed);

  if (!version || dismissed) return null;

  return (
    <div
      className="flex items-center"
      style={{
        gap: "0.5rem",
        padding: "0.375rem 0.625rem",
        margin: "0.25rem 0.375rem",
        borderRadius: "var(--radius-md)",
        background: "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.08)",
        fontSize: "var(--text-sm)",
        animation: "dl-in var(--duration-enter) cubic-bezier(0, 0, 0.2, 1) both",
      }}
    >
      <Icon
        name={downloaded ? "arrow-up-from-bracket" : "download"}
        className="text-glass-text-default shrink-0"
        css={{ fontSize: "var(--icon-size-default)" }}
      />
      <span className="text-glass-text-default flex-1 min-w-0 truncate">
        {downloaded ? `v${version} ready` : `Downloading v${version}…`}
      </span>
      {downloaded && (
        <button
          type="button"
          className="cursor-pointer text-glass-text-default hover:text-glass-text-hover hover:bg-glass-hover active:bg-glass-pressed active:text-glass-text-pressed"
          style={{
            fontSize: "var(--text-xs)",
            fontFamily: "inherit",
            fontWeight: 500,
            padding: "0.125rem 0.5rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-subtle)",
            minHeight: "var(--click-target-min)",
            transition: "color var(--duration-fast), background-color var(--duration-fast)",
          }}
          tabIndex={-1}
          onClick={() => sendCommand(INSTALLER_APPLY_UPDATE, undefined)}
          aria-label="Restart to apply update"
          data-tip="Restart to apply update"
        >
          Restart
        </button>
      )}
      <button
        type="button"
        className="flex items-center justify-center bg-transparent text-glass-text-hint hover:text-glass-text-hover hover:bg-glass-hover active:bg-glass-pressed cursor-pointer"
        style={{
          width: "var(--click-target-min)",
          height: "var(--click-target-min)",
          borderRadius: "var(--radius-sm)",
          border: "none",
          transition: "color var(--duration-fast), background-color var(--duration-fast)",
        }}
        tabIndex={-1}
        onClick={() => sendCommand(INSTALLER_DISMISS_UPDATE, undefined)}
        aria-label="Dismiss update notification"
        data-tip="Dismiss"
      >
        <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

export function ProtocolDialog() {
  const request = useInstallerStore((s) => s.protocolRequest);

  if (!request) return null;

  const dismiss = () => {
    useInstallerStore.setState({ protocolRequest: null });
  };

  const handleAllow = (always: boolean) => {
    void sendCommand(INSTALLER_ALLOW_PROTOCOL, {
      requestId: request.requestId,
      always,
    })
      .then(() => dismiss())
      .catch(console.error);
  };

  const handleDeny = () => {
    void sendCommand(INSTALLER_DENY_PROTOCOL, {
      requestId: request.requestId,
    })
      .then(() => dismiss())
      .catch(console.error);
  };

  const displayOrigin = request.origin && request.origin !== "null" ? request.origin : "this page";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      // biome-ignore lint/a11y/useSemanticElements: <dialog> has built-in close/show behaviors that conflict with our overlay
      role="dialog"
      aria-modal="true"
      // biome-ignore lint/a11y/noAutofocus: dialog must capture focus for keyboard accessibility
      autoFocus
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleDeny();
      }}
      style={{
        zIndex: "var(--z-overlay)",
        background: "oklch(0 0 0 / 0.4)",
        animation: "dl-in var(--duration-enter) cubic-bezier(0, 0, 0.2, 1) both",
        outline: "none",
      }}
    >
      <div
        style={{
          maxWidth: "26rem",
          width: "100%",
          padding: "1.25rem",
          borderRadius: "var(--radius-lg)",
          background: "var(--content-bg, var(--background))",
          boxShadow: "var(--shadow-elevated)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          animation: "dl-in var(--duration-enter) cubic-bezier(0, 0, 0.2, 1) both",
        }}
      >
        <div className="flex items-center" style={{ gap: "0.5rem" }}>
          <Icon
            name="arrow-up-right-from-square"
            className="text-foreground shrink-0"
            css={{ fontSize: "var(--icon-size-default)" }}
          />
          <span
            className="text-foreground"
            style={{ fontSize: "var(--text-base)", fontWeight: 600 }}
          >
            Open external application?
          </span>
        </div>

        <p
          className="text-muted-foreground"
          style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}
        >
          <strong style={{ color: "var(--foreground)" }}>{displayOrigin}</strong> wants to open{" "}
          <code
            title={request.url}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              padding: "0.125rem 0.25rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--muted)",
              overflowWrap: "anywhere",
            }}
          >
            {request.url}
          </code>
        </p>

        <div className="flex items-center justify-end" style={{ gap: "0.375rem" }}>
          <button
            type="button"
            className="cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent active:text-accent-foreground"
            style={{
              fontSize: "var(--text-sm)",
              fontFamily: "inherit",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "transparent",
              minHeight: "var(--click-target-min)",
              transition: "color var(--duration-fast), background-color var(--duration-fast)",
            }}
            onClick={handleDeny}
          >
            Deny
          </button>
          <button
            type="button"
            className="cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent active:text-accent-foreground"
            style={{
              fontSize: "var(--text-sm)",
              fontFamily: "inherit",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "transparent",
              minHeight: "var(--click-target-min)",
              transition: "color var(--duration-fast), background-color var(--duration-fast)",
            }}
            onClick={() => handleAllow(true)}
          >
            Always allow
          </button>
          <button
            type="button"
            className="cursor-pointer text-primary-foreground hover:opacity-90 active:opacity-80"
            style={{
              fontSize: "var(--text-sm)",
              fontFamily: "inherit",
              fontWeight: 500,
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--primary)",
              minHeight: "var(--click-target-min)",
              transition: "opacity var(--duration-fast)",
            }}
            onClick={() => handleAllow(false)}
          >
            Allow once
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstallerOverlay() {
  return <ProtocolDialog />;
}

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import {
  SettingItem,
  settingsCategoryHeadingStyle,
  settingsInputStyle,
} from "../../renderer/src/components/SettingsLayout";
import type { TabId } from "../../shared/types";
import {
  LOCAL_WEB_APP_BROWSE_DIRECTORY,
  LOCAL_WEB_APP_DELETE_CONFIG,
  LOCAL_WEB_APP_GET_CONFIG,
  LOCAL_WEB_APP_SAVE_CONFIG,
  LOCAL_WEB_APP_START,
  LOCAL_WEB_APP_STOP,
  type LocalWebAppCommands,
  type LocalWebAppStatus,
} from "./local-web-app.shared";
import { useLocalWebAppStore } from "./local-web-app.store";

type UsedCommands = Pick<
  LocalWebAppCommands,
  | typeof LOCAL_WEB_APP_SAVE_CONFIG
  | typeof LOCAL_WEB_APP_DELETE_CONFIG
  | typeof LOCAL_WEB_APP_START
  | typeof LOCAL_WEB_APP_STOP
  | typeof LOCAL_WEB_APP_BROWSE_DIRECTORY
  | typeof LOCAL_WEB_APP_GET_CONFIG
>;

function sendCommand<K extends keyof UsedCommands>(
  name: K,
  payload: UsedCommands[K]["payload"],
): Promise<UsedCommands[K]["response"]> {
  return window.chiaroscuro.sendCommand(name, payload) as Promise<UsedCommands[K]["response"]>;
}

function StatusBadge({ status }: { status: LocalWebAppStatus }) {
  const color =
    status === "running"
      ? "var(--success-foreground, oklch(0.72 0.18 142))"
      : status === "error"
        ? "var(--destructive-foreground)"
        : "var(--content-text-muted)";

  const label = status === "running" ? "Running" : status === "error" ? "Error" : "Stopped";

  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: "0.25rem",
        fontSize: "var(--text-xs)",
        color,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: "0.375rem",
          height: "0.375rem",
          borderRadius: "var(--radius-full)",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

export function LocalWebAppSettings({ tabId }: { tabId: TabId }) {
  const config = useLocalWebAppStore((s) => s.configs.get(tabId));
  const status = useLocalWebAppStore((s) => s.statuses.get(tabId)) ?? "stopped";

  // Track local overrides for unsaved edits; null = use config value
  const [dirOverride, setDirOverride] = useState<string | null>(null);
  const [cmdOverride, setCmdOverride] = useState<string | null>(null);
  const hasConfig = config !== undefined;

  // Derive display values: local override takes precedence, else config, else empty
  const localDir = dirOverride ?? config?.directory ?? "";
  const localCmd = cmdOverride ?? config?.command ?? "";

  // Clear overrides when config changes (save confirmed by main process)
  const prevConfigRef = useRef(config);
  if (config !== prevConfigRef.current) {
    prevConfigRef.current = config;
    setDirOverride(null);
    setCmdOverride(null);
  }

  // Fetch current state on mount (populates store via event)
  useEffect(() => {
    sendCommand(LOCAL_WEB_APP_GET_CONFIG, { tabId }).catch(console.error);
  }, [tabId]);

  const handleBrowse = async () => {
    const dir = await sendCommand(LOCAL_WEB_APP_BROWSE_DIRECTORY, undefined);
    if (dir) setDirOverride(dir);
  };

  const handleSave = () => {
    if (!localDir.trim() || !localCmd.trim()) return;
    sendCommand(LOCAL_WEB_APP_SAVE_CONFIG, {
      tabId,
      directory: localDir.trim(),
      command: localCmd.trim(),
    });
  };

  const handleDelete = () => {
    sendCommand(LOCAL_WEB_APP_DELETE_CONFIG, { tabId });
    setDirOverride(null);
    setCmdOverride(null);
  };

  const handleToggleProcess = () => {
    if (status === "running") {
      sendCommand(LOCAL_WEB_APP_STOP, { tabId });
    } else {
      sendCommand(LOCAL_WEB_APP_START, { tabId });
    }
  };

  const isDirty = dirOverride !== null || cmdOverride !== null;

  return (
    <section id="tab-customization-local-web-app">
      <h2 style={settingsCategoryHeadingStyle}>
        <span className="inline-flex items-center" style={{ gap: "0.375rem" }}>
          Local Web App
          {hasConfig && <StatusBadge status={status} />}
        </span>
      </h2>

      <SettingItem
        label="Project Directory"
        description="Path to the project folder containing your dev server."
      >
        <div className="flex items-center" style={{ gap: "0.375rem", maxWidth: "24rem" }}>
          <input
            type="text"
            value={localDir}
            onChange={(e) => setDirOverride(e.target.value)}
            placeholder="/path/to/project"
            aria-label="Project directory"
            style={{ ...settingsInputStyle, fontFamily: "var(--font-mono)" }}
          />
          <button
            type="button"
            onClick={handleBrowse}
            className="flex items-center justify-center shrink-0 cursor-pointer hover:brightness-110 active:brightness-90"
            style={{
              width: "var(--click-target-min)",
              height: "var(--click-target-min)",
              border: "1px solid var(--input)",
              borderRadius: "var(--radius-sm, 0.25rem)",
              background: "var(--background)",
              color: "var(--muted-foreground)",
              transition: "color var(--duration-fast)",
              padding: 0,
            }}
            aria-label="Browse for directory"
            data-tip="Browse"
          >
            <Icon name="folder-open" css={{ fontSize: "var(--icon-size-default)" }} />
          </button>
        </div>
      </SettingItem>

      <SettingItem
        label="Start Command"
        description="Shell command to run the dev server (e.g. npm start, bun dev)."
      >
        <input
          type="text"
          value={localCmd}
          onChange={(e) => setCmdOverride(e.target.value)}
          placeholder="npm start"
          aria-label="Start command"
          style={{ ...settingsInputStyle, maxWidth: "24rem", fontFamily: "var(--font-mono)" }}
        />
      </SettingItem>

      {/* Action buttons */}
      <div className="flex items-center flex-wrap" style={{ gap: "0.5rem", paddingTop: "0.25rem" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!localDir.trim() || !localCmd.trim()}
          className="inline-flex items-center cursor-pointer font-[inherit] transition-all hover:brightness-110 active:brightness-90 disabled:opacity-40 disabled:cursor-default"
          style={{
            gap: "0.375rem",
            padding: "0.375rem 0.75rem",
            fontSize: "var(--text-sm)",
            color: "var(--foreground)",
            background: "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)",
            border: "1px solid oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.3)",
            borderRadius: "var(--radius-sm, 0.25rem)",
          }}
        >
          <Icon name="floppy-disk" css={{ fontSize: "var(--icon-size-default)" }} />
          {isDirty ? "Save & Restart" : "Save"}
        </button>

        {hasConfig && (
          <>
            <button
              type="button"
              onClick={handleToggleProcess}
              className="inline-flex items-center cursor-pointer font-[inherit] transition-all hover:brightness-110 active:brightness-90"
              style={{
                gap: "0.375rem",
                padding: "0.375rem 0.75rem",
                fontSize: "var(--text-sm)",
                color: "var(--foreground)",
                background: "var(--background)",
                border: "1px solid var(--input)",
                borderRadius: "var(--radius-sm, 0.25rem)",
              }}
            >
              <Icon
                name={status === "running" ? "stop" : "play"}
                css={{ fontSize: "var(--icon-size-default)" }}
              />
              {status === "running" ? "Stop" : "Start"}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center cursor-pointer font-[inherit] transition-all hover:brightness-110 active:brightness-90"
              style={{
                gap: "0.375rem",
                padding: "0.375rem 0.75rem",
                fontSize: "var(--text-sm)",
                color: "var(--destructive-foreground)",
                background: "transparent",
                border: "1px solid var(--input)",
                borderRadius: "var(--radius-sm, 0.25rem)",
              }}
            >
              <Icon name="trash-can" css={{ fontSize: "var(--icon-size-default)" }} />
              Remove
            </button>
          </>
        )}
      </div>
    </section>
  );
}

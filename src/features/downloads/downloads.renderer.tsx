import { useShallow } from "zustand/react/shallow";
import { Icon } from "../../renderer/src/components/Icon";
import {
  DOWNLOADS_CANCEL,
  DOWNLOADS_PAUSE,
  DOWNLOADS_RESUME,
  type Download,
  type DownloadsCommands,
} from "./downloads.shared";
import { useDownloadsStore } from "./downloads.store";

type UsedCommands = Pick<
  DownloadsCommands,
  typeof DOWNLOADS_CANCEL | typeof DOWNLOADS_PAUSE | typeof DOWNLOADS_RESUME
>;

function sendCommand<K extends keyof UsedCommands>(name: K, payload: UsedCommands[K]["payload"]) {
  void window.chiaroscuro.sendCommand(name, payload);
}

/** Format bytes as human-readable string (e.g. "1.5 MB"). */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / k ** i;
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function DownloadItem({ download }: { download: Download }) {
  const isActive = download.state === "progressing" || download.state === "paused";
  const isPaused = download.state === "paused";
  const isDone = !isActive;
  const progress = Math.min(
    100,
    download.totalBytes > 0 ? Math.round((download.receivedBytes / download.totalBytes) * 100) : 0,
  );
  const hasSize = download.totalBytes > 0;

  return (
    <div
      className="group relative overflow-hidden"
      style={{
        padding: "0.25rem 0.5rem 0.25rem 0.75rem",
        margin: "0.125rem 0.375rem",
        borderRadius: "var(--radius-md)",
        opacity: isDone ? 0.4 : 1,
        transition: "opacity var(--duration-normal) var(--ease-in-out)",
        animation: "dl-in var(--duration-enter) cubic-bezier(0, 0, 0.2, 1) both",
      }}
    >
      {/* Accent progress fill — the card background visualizes progress */}
      {hasSize && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: isDone ? "100%" : `${progress}%`,
            borderRadius: "inherit",
            background: `oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / ${isDone ? 0.03 : isPaused ? 0.04 : 0.07})`,
            transition:
              "width var(--duration-fast) var(--ease-out), background-color var(--duration-normal)",
            animation: isPaused ? "dl-pulse 2.5s ease-in-out infinite" : "none",
          }}
        />
      )}

      {/* Content row */}
      <div className="relative flex items-center" style={{ gap: "0.375rem" }}>
        {/* Status icon */}
        <Icon
          name={isDone ? "circle-check" : "arrow-down"}
          className={isDone ? "text-glass-text-hint" : "text-glass-text-default"}
          css={{
            fontSize: "var(--icon-size-default)",
            flexShrink: 0,
            transition: "color var(--duration-fast)",
          }}
        />

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div
            className="truncate text-glass-text-default"
            style={{ fontSize: "var(--text-sm)", lineHeight: 1.4 }}
          >
            {download.filename}
          </div>
          <div
            className="text-glass-text-hint"
            style={{
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {isDone
              ? formatBytes(download.totalBytes || download.receivedBytes)
              : hasSize
                ? `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)}`
                : formatBytes(download.receivedBytes)}
          </div>
        </div>

        {/* Right side: percentage (default) or controls (hover) */}
        {isActive && (
          <div className="shrink-0 relative flex items-center">
            {/* Percentage — fades out on hover to reveal controls */}
            {hasSize && (
              <span
                className="text-glass-text-muted group-hover:opacity-0"
                style={{
                  fontSize: "var(--text-xs)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "-0.02em",
                  transition: "opacity var(--duration-fast)",
                  minWidth: "2rem",
                  textAlign: "right",
                }}
              >
                {progress}%
              </span>
            )}

            {/* Controls — appear on hover */}
            <div
              className="absolute right-0 flex items-center opacity-0 group-hover:opacity-100"
              style={{
                gap: "0.125rem",
                transition: "opacity var(--duration-fast)",
              }}
            >
              <button
                type="button"
                className="flex items-center justify-center bg-transparent text-glass-text-hint hover:text-glass-text-hover hover:bg-glass-hover active:bg-glass-pressed active:text-glass-text-pressed cursor-pointer"
                style={{
                  width: "var(--click-target-min)",
                  height: "var(--click-target-min)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  transition: "color var(--duration-fast), background-color var(--duration-fast)",
                }}
                tabIndex={-1}
                onClick={() =>
                  isPaused
                    ? sendCommand(DOWNLOADS_RESUME, { downloadId: download.id })
                    : sendCommand(DOWNLOADS_PAUSE, { downloadId: download.id })
                }
                aria-label={isPaused ? "Resume download" : "Pause download"}
                data-tip={isPaused ? "Resume" : "Pause"}
              >
                <Icon
                  name={isPaused ? "play" : "pause"}
                  css={{ fontSize: "var(--icon-size-default)" }}
                />
              </button>
              <button
                type="button"
                className="flex items-center justify-center bg-transparent text-glass-text-hint hover:text-destructive hover:bg-glass-hover active:bg-glass-pressed cursor-pointer"
                style={{
                  width: "var(--click-target-min)",
                  height: "var(--click-target-min)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  transition: "color var(--duration-fast), background-color var(--duration-fast)",
                }}
                tabIndex={-1}
                onClick={() => sendCommand(DOWNLOADS_CANCEL, { downloadId: download.id })}
                aria-label="Cancel download"
                data-tip="Cancel"
              >
                <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DownloadsSection() {
  const downloads = useDownloadsStore(useShallow((s) => [...s.downloads.values()]));

  if (downloads.length === 0) return null;

  return (
    <div style={{ padding: "0.25rem 0" }}>
      {/* Divider with label */}
      <div
        className="flex items-center"
        style={{ gap: "0.5rem", padding: "0.125rem 0.5rem 0.25rem 0.875rem" }}
      >
        <span
          className="text-glass-text-hint flex items-center shrink-0"
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            gap: "0.25rem",
          }}
        >
          <Icon name="arrow-down" css={{ fontSize: "var(--icon-size-default)" }} />
          Downloads
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
      </div>

      {/* Download items */}
      {downloads.map((dl) => (
        <DownloadItem key={dl.id} download={dl} />
      ))}
    </div>
  );
}

import { Icon } from "../../renderer/src/components/Icon";
import {
  DOWNLOADS_CANCEL,
  DOWNLOADS_PAUSE,
  DOWNLOADS_RESUME,
  type Download,
} from "./downloads.shared";
import { useDownloadsStore } from "./downloads.store";

function sendCommand(name: string, payload: unknown) {
  window.chiaroscuro.sendCommand(name, payload);
}

export function DownloadItem({ download }: { download: Download }) {
  const isActive = download.state === "progressing" || download.state === "paused";
  const isDone = !isActive;
  const progress =
    download.totalBytes > 0 ? Math.round((download.receivedBytes / download.totalBytes) * 100) : 0;

  return (
    <div
      className="group flex items-center"
      style={{
        gap: "0.375rem",
        padding: "0.25rem 0.5rem",
        borderRadius: "var(--radius-sm)",
        opacity: isDone ? 0.5 : 1,
        transition: "opacity var(--duration-normal) var(--ease-in-out)",
      }}
    >
      {/* Icon */}
      <Icon
        name={isDone ? "circle-check" : "arrow-down"}
        className={isDone ? "text-glass-text-hint" : "text-glass-text-default"}
        css={{ fontSize: "var(--icon-size-default)", flexShrink: 0 }}
      />

      {/* Filename + progress bar */}
      <div className="flex-1 min-w-0" style={{ gap: "0.125rem" }}>
        <div
          className="truncate text-glass-text-default"
          style={{ fontSize: "var(--text-sm)", lineHeight: 1.3 }}
        >
          {download.filename}
        </div>
        {isActive && download.totalBytes > 0 && (
          <div
            style={{
              height: "0.125rem",
              borderRadius: "0.0625rem",
              background: "var(--glass-border)",
              overflow: "hidden",
              marginTop: "0.125rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: "0.0625rem",
                background: "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250))",
                transition: "width var(--duration-fast) var(--ease-out)",
              }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      {isActive && (
        <div className="flex items-center" style={{ gap: "0.125rem", flexShrink: 0 }}>
          <button
            type="button"
            className="flex items-center justify-center bg-transparent text-glass-text-hint hover:text-glass-text-hover hover:bg-glass-hover active:bg-glass-pressed active:text-glass-text-pressed cursor-pointer"
            style={{
              width: "var(--click-target-min)",
              height: "var(--click-target-min)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              transition: "color var(--duration-fast), background var(--duration-fast)",
            }}
            tabIndex={-1}
            onClick={() =>
              download.state === "paused"
                ? sendCommand(DOWNLOADS_RESUME, { downloadId: download.id })
                : sendCommand(DOWNLOADS_PAUSE, { downloadId: download.id })
            }
            aria-label={download.state === "paused" ? "Resume download" : "Pause download"}
            data-tip={download.state === "paused" ? "Resume" : "Pause"}
          >
            <Icon
              name={download.state === "paused" ? "play" : "pause"}
              css={{ fontSize: "var(--icon-size-default)" }}
            />
          </button>
          <button
            type="button"
            className="flex items-center justify-center bg-transparent text-glass-text-hint hover:text-glass-text-hover hover:bg-glass-hover active:bg-glass-pressed active:text-glass-text-pressed cursor-pointer"
            style={{
              width: "var(--click-target-min)",
              height: "var(--click-target-min)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              transition: "color var(--duration-fast), background var(--duration-fast)",
            }}
            tabIndex={-1}
            onClick={() => sendCommand(DOWNLOADS_CANCEL, { downloadId: download.id })}
            aria-label="Cancel download"
            data-tip="Cancel"
          >
            <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
          </button>
        </div>
      )}
    </div>
  );
}

export function DownloadsSection() {
  const downloads = useDownloadsStore((s) => s.downloads);

  if (downloads.size === 0) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--glass-border)",
        padding: "0.375rem 0",
      }}
    >
      <div
        className="flex items-center text-glass-text-hint"
        style={{
          padding: "0 0.5rem 0.25rem",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <Icon
          name="arrow-down"
          css={{ fontSize: "var(--icon-size-default)", marginRight: "0.25rem" }}
        />
        Downloads
      </div>
      {[...downloads.values()].map((dl) => (
        <DownloadItem key={dl.id} download={dl} />
      ))}
    </div>
  );
}

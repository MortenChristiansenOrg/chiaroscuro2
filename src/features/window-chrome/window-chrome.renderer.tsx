import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "../tabs/tabs.shared";
import { useTabsStore } from "../tabs/tabs.store";
import type { WindowChromeCommands } from "./window-chrome.shared";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_GO_BACK,
  WINDOW_GO_FORWARD,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
  WINDOW_RELOAD,
} from "./window-chrome.shared";
import { useWindowChromeStore } from "./window-chrome.store";

function sendCommand(name: string & keyof WindowChromeCommands, payload?: unknown) {
  window.chiaroscuro.sendCommand(name, payload ?? undefined);
}

// ── Components ──────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 26,
  borderRadius: "var(--radius-md)",
  border: "none",
  cursor: "pointer",
  transition:
    "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
};

export function NavButtons() {
  return (
    <div className="flex" style={{ gap: 1, paddingLeft: 8 }}>
      <button
        type="button"
        style={navBtnStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
        onClick={() => sendCommand(WINDOW_GO_BACK)}
        aria-label="Go back"
        data-tip="Back"
      >
        <i className="fa-solid fa-chevron-left" style={{ fontSize: "var(--icon-size-default)" }} />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
        onClick={() => sendCommand(WINDOW_GO_FORWARD)}
        aria-label="Go forward"
        data-tip="Forward"
      >
        <i className="fa-solid fa-chevron-right" style={{ fontSize: "var(--icon-size-default)" }} />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
        onClick={() => sendCommand(WINDOW_RELOAD)}
        aria-label="Reload"
        data-tip="Reload"
      >
        <i className="fa-solid fa-rotate-right" style={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

export function UrlPill() {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab: Tab | undefined = useTabsStore((s) =>
    s.activeTabId ? s.tabs.get(s.activeTabId) : undefined,
  );
  const isLoading = useWindowChromeStore((s) => s.loadingTabs.size > 0);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    sendCommand(WINDOW_COPY_ADDRESS);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  if (!activeTab) return null;

  let displayUrl = activeTab.url;
  try {
    const parsed = new URL(activeTab.url);
    displayUrl = parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
  } catch {
    // keep raw url
  }

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      {/* Loading spinner ring — conic-gradient masked to border edge */}
      {isLoading && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: "var(--radius-lg)",
            padding: 2,
            background:
              "conic-gradient(from var(--url-angle), oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0) 0%, oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.8) 10%, oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0) 22%, transparent 22%)",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            animation: "url-spin 2.5s linear infinite",
          }}
        />
      )}
      {/* Pill container — needs explicit no-drag so button receives mouse events */}
      <div
        className="relative flex items-center"
        style={
          {
            gap: 2,
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-mono)",
            color: "var(--glass-text-default)",
            padding: "3px 4px 3px 14px",
            borderRadius: "var(--radius-lg)",
            background: "var(--glass-subtle)",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
        <span className="truncate" style={{ maxWidth: 300 }}>
          {displayUrl}
        </span>
        <button
          type="button"
          className={`focus-ring flex items-center justify-center shrink-0 cursor-pointer ${
            copied
              ? ""
              : "text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
          }`}
          style={{
            width: 22,
            height: 22,
            borderRadius: "var(--radius-md)",
            border: "none",
            background: copied
              ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.12)"
              : "transparent",
            color: copied
              ? "oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250))"
              : undefined,
            transition:
              "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
          }}
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy URL"}
          data-tip={copied ? "Copied!" : "Copy URL"}
        >
          <i
            className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"}
            style={{
              fontSize: "var(--icon-size-default)",
              ...(copied
                ? { animation: "copy-confirm var(--duration-normal) var(--ease-out)" }
                : {}),
            }}
          />
        </button>
      </div>
    </div>
  );
}

const winCtrlStyle: React.CSSProperties = {
  display: "flex",
  width: 36,
  height: 26,
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  cursor: "pointer",
  transition:
    "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
};

export function WindowControls() {
  const maximized = useWindowChromeStore((s) => s.maximized);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MINIMIZE)}
        style={winCtrlStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
        aria-label="Minimize"
        data-tip="Minimize"
      >
        <i className="fa-solid fa-minus" style={{ fontSize: "var(--icon-size-default)" }} />
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
        style={winCtrlStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
        aria-label={maximized ? "Restore" : "Maximize"}
        data-tip={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? (
          <i
            className="fa-solid fa-window-restore"
            style={{ fontSize: "var(--icon-size-default)" }}
          />
        ) : (
          <i className="fa-regular fa-square" style={{ fontSize: "var(--icon-size-default)" }} />
        )}
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_CLOSE)}
        style={winCtrlStyle}
        className="focus-ring bg-transparent text-glass-text-muted hover:bg-destructive hover:text-white active:bg-destructive/80"
        aria-label="Close"
        data-tip="Close"
      >
        <i className="fa-solid fa-xmark" style={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

const isMac = typeof window !== "undefined" && window.chiaroscuro?.getPlatformName() === "darwin";

export function TitleBar() {
  return (
    <div
      className="relative flex select-none items-center shrink-0"
      style={
        {
          height: "var(--titlebar-height)",
          WebkitAppRegion: "drag",
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-backdrop-blur))",
        } as React.CSSProperties
      }
      onDoubleClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
    >
      {/* macOS: traffic lights are on left, leave space */}
      {isMac && <div className="w-[70px] shrink-0" />}

      {/* Nav buttons */}
      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <NavButtons />
      </div>

      {/* URL pill (centered) */}
      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <UrlPill />
      </div>

      {/* Flexible spacer */}
      <div className="flex-1 min-w-0" />

      {/* Window controls: only on non-macOS */}
      {!isMac && (
        <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <WindowControls />
        </div>
      )}
    </div>
  );
}

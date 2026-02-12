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

// ── SVG Icons ───────────────────────────────────────────────────

function MinimizeIcon() {
  return (
    <svg aria-hidden="true" width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
      <rect width="10" height="1" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="0.5" y="2.5" width="7" height="7" />
      <polyline points="2.5,2.5 2.5,0.5 9.5,0.5 9.5,7.5 7.5,7.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <line x1="0" y1="0" x2="10" y2="10" />
      <line x1="10" y1="0" x2="0" y2="10" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <polyline points="6,1 2,5 6,9" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <polyline points="4,1 8,5 4,9" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M8,3 A3.5,3.5 0 1,1 5,1.5" />
      <polyline points="8,0.5 8,3.5 5,3.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <path d="M8.5,3.5 L8.5,2 C8.5,1.45 8.05,1 7.5,1 L2,1 C1.45,1 1,1.45 1,2 L1,7.5 C1,8.05 1.45,8.5 2,8.5 L3.5,8.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <polyline points="2.5,6 5,9 9.5,3" />
    </svg>
  );
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
  background: "none",
  cursor: "pointer",
  color: "var(--glass-text-default)",
  transition: "all var(--duration-fast)",
};

function NavButtons() {
  return (
    <div className="flex" style={{ gap: 1, paddingLeft: 8 }}>
      <button
        type="button"
        style={navBtnStyle}
        className="hover:bg-glass-hover hover:text-glass-text-hover"
        onClick={() => sendCommand(WINDOW_GO_BACK)}
        aria-label="Go back"
        data-tip="Back"
      >
        <BackIcon />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className="hover:bg-glass-hover hover:text-glass-text-hover"
        onClick={() => sendCommand(WINDOW_GO_FORWARD)}
        aria-label="Go forward"
        data-tip="Forward"
      >
        <ForwardIcon />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className="hover:bg-glass-hover hover:text-glass-text-hover"
        onClick={() => sendCommand(WINDOW_RELOAD)}
        aria-label="Reload"
        data-tip="Reload"
      >
        <RefreshIcon />
      </button>
    </div>
  );
}

function UrlPill() {
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
      {/* Loading spinner ring */}
      {isLoading && (
        <div
          className="absolute inset-[-2px] animate-spin"
          style={{
            borderRadius: 14,
            background:
              "conic-gradient(from 0deg, oklch(0.65 0.15 250), oklch(0.65 0.15 250 / 0) 120deg)",
          }}
        />
      )}
      {/* Pill */}
      <div
        className="relative flex items-center transition-colors"
        style={{
          gap: 2,
          fontSize: 11,
          color: "var(--glass-text-hover)",
          padding: "3px 4px 3px 14px",
          borderRadius: "var(--radius-lg)",
          background: "var(--glass-subtle)",
        }}
      >
        <span className="select-all truncate" style={{ maxWidth: 300 }}>
          {displayUrl}
        </span>
        <button
          type="button"
          className="flex items-center justify-center transition-all"
          style={{
            width: 22,
            height: 22,
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: copied ? "var(--glass-text-hover)" : "var(--glass-text-default)",
          }}
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy URL"}
          data-tip={copied ? "Copied!" : "Copy URL"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function WindowControls() {
  const maximized = useWindowChromeStore((s) => s.maximized);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MINIMIZE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-foreground/10 active:bg-foreground/15 hover:text-foreground transition-colors"
        aria-label="Minimize"
        data-tip="Minimize"
      >
        <MinimizeIcon />
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-foreground/10 active:bg-foreground/15 hover:text-foreground transition-colors"
        aria-label={maximized ? "Restore" : "Maximize"}
        data-tip={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_CLOSE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-destructive active:bg-destructive/80 hover:text-white transition-colors"
        aria-label="Close"
        data-tip="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

const isMac = typeof window !== "undefined" && window.chiaroscuro?.getPlatformName() === "darwin";

export function TitleBar() {
  return (
    <div
      className="relative flex h-9 select-none items-center shrink-0"
      style={
        {
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

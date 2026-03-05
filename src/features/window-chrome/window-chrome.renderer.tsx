import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import { DOMAIN_CSS_OPEN } from "../domain-css/domain-css.shared";
import { FindBar } from "../find-text/find-text.renderer";
import { useFindTextStore } from "../find-text/find-text.store";
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

function sendCommand<K extends keyof WindowChromeCommands>(
  name: K,
  payload?: WindowChromeCommands[K]["payload"],
) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Components ──────────────────────────────────────────────────

const btnBaseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  cursor: "pointer",
  transition:
    "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
};

const navBtnStyle: React.CSSProperties = {
  ...btnBaseStyle,
  width: 28,
  height: 26,
  borderRadius: "var(--radius-md)",
};

const navBtnClass =
  "bg-transparent text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed";

export function NavButtons() {
  return (
    <div className="flex" style={{ gap: "0.0625rem", paddingLeft: "0.5rem" }}>
      <button
        type="button"
        style={navBtnStyle}
        className={navBtnClass}
        tabIndex={-1}
        onClick={() => sendCommand(WINDOW_GO_BACK)}
        aria-label="Go back"
        data-tip="Back"
      >
        <Icon name="chevron-left" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className={navBtnClass}
        tabIndex={-1}
        onClick={() => sendCommand(WINDOW_GO_FORWARD)}
        aria-label="Go forward"
        data-tip="Forward"
      >
        <Icon name="chevron-right" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
      <button
        type="button"
        style={navBtnStyle}
        className={navBtnClass}
        tabIndex={-1}
        onClick={() => sendCommand(WINDOW_RELOAD)}
        aria-label="Reload"
        data-tip="Reload"
      >
        <Icon name="rotate-right" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

export function UrlPill({ hidden }: { hidden?: boolean }) {
  const url = useTabsStore((s) => {
    const tab = s.activeTabId ? s.tabs.get(s.activeTabId) : undefined;
    return tab?.url ?? "";
  });
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const isLoading = useWindowChromeStore(
    (s) => activeTabId != null && s.loadingTabs.has(activeTabId),
  );
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = () => {
    sendCommand(WINDOW_COPY_ADDRESS);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  if (!url) return null;

  let displayUrl = url;
  let hostname = "";
  let isWebUrl = false;
  if (url.startsWith("app:domain-css")) {
    const qIdx = url.indexOf("?");
    if (qIdx !== -1) {
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const domain = params.get("domain");
      if (domain) displayUrl = `Customization: ${domain}`;
    }
  } else {
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      const path = parsed.pathname !== "/" ? parsed.pathname : "";
      displayUrl = parsed.hostname + path;
      if (parsed.protocol === "file:") {
        const decodedPath = decodeURIComponent(path);
        if (/^\/[A-Za-z]:/.test(decodedPath)) {
          // Windows drive path like /C:/... — strip leading slash
          displayUrl = decodedPath.slice(1);
        } else if (parsed.hostname) {
          displayUrl = `//${parsed.hostname}${decodedPath}`;
        } else {
          displayUrl = decodedPath;
        }
      }
      isWebUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      // keep raw url
    }
  }

  const handleDomainCss = () => {
    if (hostname) {
      window.chiaroscuro.sendCommand(DOMAIN_CSS_OPEN, { domain: hostname });
    }
  };

  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        transition:
          "opacity var(--duration-normal) var(--ease-out), scale var(--duration-normal) var(--ease-out)",
        opacity: hidden ? 0 : 1,
        scale: hidden ? "0.96" : "1",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      {/* Loading spinner ring — conic-gradient masked to border edge */}
      {isLoading && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: "var(--radius-lg)",
            padding: 2,
            background:
              "conic-gradient(from var(--url-angle), oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0) 0%, oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0.8) 10%, oklch(var(--accent-L) var(--accent-C) var(--accent-hue, 250) / 0) 22%, transparent 22%)",
            mask: "linear-gradient(oklch(1 0 0) 0 0) content-box, linear-gradient(oklch(1 0 0) 0 0)",
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
            gap: "0.125rem",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-mono)",
            color: "var(--glass-text-default)",
            padding: "0.1875rem 0.25rem",
            borderRadius: "var(--radius-lg)",
            background: "var(--glass-subtle)",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
        {isWebUrl && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 cursor-pointer text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
            style={{
              width: 24,
              height: 24,
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "transparent",
              transition:
                "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
            }}
            tabIndex={-1}
            onClick={handleDomainCss}
            aria-label="Domain customization"
            data-tip="Domain customization"
          >
            <Icon name="sliders" style="solid" css={{ fontSize: "var(--icon-size-default)" }} />
          </button>
        )}
        <span
          className="truncate"
          style={{ maxWidth: 300, paddingLeft: isWebUrl ? 0 : "0.625rem" }}
        >
          {displayUrl}
        </span>
        <button
          type="button"
          className={`flex items-center justify-center shrink-0 cursor-pointer ${
            copied
              ? ""
              : "text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
          }`}
          style={{
            width: 24,
            height: 24,
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
          tabIndex={-1}
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy URL"}
          data-tip={copied ? "Copied!" : "Copy URL"}
        >
          {copied ? (
            <Icon
              name="check"
              css={{
                fontSize: "var(--icon-size-default)",
                animation: "copy-confirm var(--duration-normal) var(--ease-out)",
              }}
            />
          ) : (
            <Icon name="copy" style="regular" css={{ fontSize: "var(--icon-size-default)" }} />
          )}
        </button>
      </div>
    </div>
  );
}

const winCtrlStyle: React.CSSProperties = {
  ...btnBaseStyle,
  width: 36,
  height: 26,
};

export function WindowControls() {
  const maximized = useWindowChromeStore((s) => s.maximized);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MINIMIZE)}
        style={winCtrlStyle}
        className={navBtnClass}
        tabIndex={-1}
        aria-label="Minimize"
        data-tip="Minimize"
      >
        <Icon name="minus" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
        style={winCtrlStyle}
        className={navBtnClass}
        tabIndex={-1}
        aria-label={maximized ? "Restore" : "Maximize"}
        data-tip={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? (
          <Icon name="window-restore" css={{ fontSize: "var(--icon-size-default)" }} />
        ) : (
          <Icon name="square" style="regular" css={{ fontSize: "var(--icon-size-default)" }} />
        )}
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_CLOSE)}
        style={winCtrlStyle}
        className="bg-transparent text-glass-text-muted hover:bg-destructive hover:text-glass-text-primary active:bg-destructive/80"
        tabIndex={-1}
        aria-label="Close"
        data-tip="Close"
      >
        <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
      </button>
    </div>
  );
}

const isMac = typeof window !== "undefined" && window.chiaroscuro?.getPlatformName() === "darwin";

export function TitleBar() {
  return (
    <div
      data-testid="title-bar"
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

      {/* URL pill / Find bar crossfade (centered — no-drag is on inner container) */}
      <UrlPill hidden={useFindTextStore((s) => s.active)} />
      <FindBar />

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

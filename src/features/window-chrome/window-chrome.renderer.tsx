import { useCallback, useEffect, useRef, useState } from "react";
import type { WindowChromeCommands } from "./window-chrome.shared";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
} from "./window-chrome.shared";
import { useWindowChromeStore } from "./window-chrome.store";

function sendCommand(name: string & keyof WindowChromeCommands) {
  window.chiaroscuro.sendCommand(name, undefined);
}

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

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
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
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <polyline points="2.5,6 5,9 9.5,3" />
    </svg>
  );
}

function CopyAddressButton() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = useCallback(() => {
    sendCommand(WINDOW_COPY_ADDRESS);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex h-8 w-10 items-center justify-center text-foreground/60 hover:bg-foreground/10 active:bg-foreground/15 hover:text-foreground transition-colors"
      data-tip={copied ? "Copied!" : "Copy address"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function WindowControls() {
  const maximized = useWindowChromeStore((s) => s.maximized);

  return (
    <div className="flex items-center">
      <CopyAddressButton />

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MINIMIZE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-foreground/10 active:bg-foreground/15 hover:text-foreground transition-colors"
        data-tip="Minimize"
      >
        <MinimizeIcon />
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-foreground/10 active:bg-foreground/15 hover:text-foreground transition-colors"
        data-tip={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button
        type="button"
        onClick={() => sendCommand(WINDOW_CLOSE)}
        className="flex h-8 w-12 items-center justify-center text-foreground/60 hover:bg-destructive active:bg-destructive/80 hover:text-white transition-colors"
        data-tip="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function LoadingIndicator() {
  const isLoading = useWindowChromeStore((s) => s.loadingTabs.size > 0);
  if (!isLoading) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-foreground/5">
      <div className="h-full w-1/3 animate-pulse bg-primary/60 rounded-full" />
    </div>
  );
}

const isMac = typeof window !== "undefined" && window.chiaroscuro?.getPlatformName() === "darwin";

export function TitleBar() {
  return (
    <div
      className="relative flex h-8 select-none items-center bg-background/80 backdrop-blur-sm"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={() => sendCommand(WINDOW_MAXIMIZE_RESTORE)}
    >
      {/* macOS: traffic lights are on left, leave space */}
      {isMac && <div className="w-[70px] shrink-0" />}

      {/* Flexible spacer */}
      <div className="flex-1 min-w-0" />

      {/* Window controls: only on non-macOS */}
      {!isMac && (
        <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <WindowControls />
        </div>
      )}

      <LoadingIndicator />
    </div>
  );
}

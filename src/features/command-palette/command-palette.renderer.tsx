import { useCallback, useEffect, useRef, useState } from "react";
import { useTabsStore } from "../tabs/tabs.store";
import { useCommandPaletteStore } from "./command-palette.store";

function sendCommand(name: string, payload: unknown) {
  window.chiaroscuro.sendCommand(name, payload);
}

// ── Bang providers ──────────────────────────────────────────────
const BANG_PROVIDERS: Record<string, string> = {
  "!g": "https://www.google.com/search?q=",
  "!d": "https://duckduckgo.com/?q=",
  "!gh": "https://github.com/search?q=",
  "!yt": "https://www.youtube.com/results?search_query=",
  "!w": "https://en.wikipedia.org/w/index.php?search=",
};

export function resolveInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Bang at start: !g query
  const bangStartMatch = trimmed.match(/^(![\w]+)\s+(.+)/);
  if (bangStartMatch?.[1] && bangStartMatch[2]) {
    const provider = BANG_PROVIDERS[bangStartMatch[1]];
    if (provider) return provider + encodeURIComponent(bangStartMatch[2]);
  }

  // Bang at end: query !g
  const bangEndMatch = trimmed.match(/^(.+)\s+(![\w]+)$/);
  if (bangEndMatch?.[1] && bangEndMatch[2]) {
    const provider = BANG_PROVIDERS[bangEndMatch[2]];
    if (provider) return provider + encodeURIComponent(bangEndMatch[1]);
  }

  // Has explicit protocol
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Looks like a URL (has dot, no spaces)
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }

  // Default: DuckDuckGo search
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function CommandPaletteOverlay() {
  const open = useCommandPaletteStore((s) => s.open);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!visible) return;
    // Play exit animation then unmount
    setClosing(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 150); // --duration-exit
    return () => clearTimeout(timer);
  }, [open, visible]);

  const handleClose = useCallback(() => {
    sendCommand("command-palette:hide", undefined);
  }, []);

  // Global Esc handler — works even if input loses focus
  useEffect(() => {
    if (!visible || closing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, closing, handleClose]);

  // Focus trap — nothing else should be focusable while palette is open
  useEffect(() => {
    if (!visible || closing) return;
    const input = inputRef.current;
    if (!input) return;
    const refocus = () => requestAnimationFrame(() => input.focus());
    input.addEventListener("blur", refocus);
    return () => input.removeEventListener("blur", refocus);
  }, [visible, closing]);

  const handleSubmit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;

      const value = inputRef.current?.value;
      if (!value) return;

      const url = resolveInput(value);
      if (!url) return;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter: navigate current tab
        if (activeTabId) {
          sendCommand("tabs:navigate", { tabId: activeTabId, url });
        } else {
          sendCommand("tabs:create", { url });
        }
      } else {
        // Enter: new tab
        sendCommand("tabs:create", { url });
      }

      sendCommand("command-palette:hide", undefined);
      if (inputRef.current) inputRef.current.value = "";
    },
    [activeTabId],
  );

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: "var(--z-overlay)" as unknown as number,
        background: "oklch(0 0 0 / 0.4)",
        backdropFilter: "blur(4px)",
        animation: closing
          ? "backdrop-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : "backdrop-in 200ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      onClick={handleClose}
      onKeyDown={() => {}}
    >
      <div
        className="flex flex-col"
        // biome-ignore lint/a11y/useSemanticElements: overlay handles backdrop click
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        style={{
          width: 560,
          background: "var(--glass-bg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--shadow-elevated)",
          backdropFilter: "blur(var(--glass-backdrop-blur))",
          animation: closing
            ? "palette-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards"
            : "palette-in 200ms cubic-bezier(0, 0, 0.2, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search or enter URL..."
          className="w-full outline-none placeholder:text-glass-text-hint"
          style={{
            background: "transparent",
            color: "var(--glass-text-primary)",
            fontSize: "var(--text-md)",
            padding: "16px 20px",
            border: "none",
            fontFamily: "inherit",
          }}
          onKeyDown={handleSubmit}
          autoComplete="off"
          spellCheck={false}
        />
        <div
          className="flex items-center justify-between"
          style={{
            padding: "8px 20px 12px",
            fontSize: "var(--text-sm)",
            color: "var(--glass-text-hint)",
            borderTop: "1px solid var(--glass-border)",
          }}
        >
          <span>Enter = new tab &middot; Ctrl+Enter = current tab &middot; Esc = close</span>
        </div>
      </div>
    </div>
  );
}

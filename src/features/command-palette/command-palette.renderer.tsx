import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "./command-palette.shared";
import { useCommandPaletteStore } from "./command-palette.store";
import { type ResolvedInput, resolveInputDetailed } from "./resolve-input";

export function CommandPaletteOverlay() {
  const open = useCommandPaletteStore((s) => s.open);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [resolution, setResolution] = useState<ResolvedInput>({ type: "empty" });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setVisible(true);
      setClosing(false);
      setResolution({ type: "empty" });
      setSuggestions([]);
      setSelectedSuggestion(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!visible) return;
    // Play exit animation then unmount
    setClosing(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }, 150); // --duration-exit
    return () => clearTimeout(timer);
  }, [open, visible]);

  const handleClose = () => {
    window.chiaroscuro.sendCommand("command-palette:hide", undefined);
  };

  // Global Esc handler — works even if input loses focus
  useEffect(() => {
    if (!visible || closing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.chiaroscuro.sendCommand("command-palette:hide", undefined);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, closing]);

  // Focus trap — nothing else should be focusable while palette is open
  useEffect(() => {
    if (!visible || closing) return;
    const input = inputRef.current;
    if (!input) return;
    const refocus = () => requestAnimationFrame(() => input.focus());
    input.addEventListener("blur", refocus);
    return () => input.removeEventListener("blur", refocus);
  }, [visible, closing]);

  const handleInputChange = () => {
    const value = inputRef.current?.value ?? "";
    setResolution(resolveInputDetailed(value));
    setSelectedSuggestion(-1);

    // Debounce suggestion search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        window.chiaroscuro
          .sendCommand("command-palette:search-visits", { query: value.trim() })
          .then((results) => setSuggestions(results as Suggestion[]))
          .catch(() => setSuggestions([]));
      }, 150);
    } else {
      setSuggestions([]);
    }
  };

  const executeCommand = (value: string, inCurrentTab: boolean) => {
    if (!value.trim()) return;
    window.chiaroscuro.sendCommand("command-palette:execute", {
      command: value,
      inCurrentTab,
    });
    window.chiaroscuro.sendCommand("command-palette:hide", undefined);
    if (inputRef.current) inputRef.current.value = "";
    setSuggestions([]);
    setResolution({ type: "empty" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Arrow navigation for suggestions
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion((prev) => Math.max(prev - 1, -1));
        return;
      }
    }

    if (e.key !== "Enter") return;

    // Use selected suggestion if any
    if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
      executeCommand(suggestions[selectedSuggestion].url, e.ctrlKey || e.metaKey);
      return;
    }

    const value = inputRef.current?.value;
    if (value) executeCommand(value, e.ctrlKey || e.metaKey);
  };

  if (!visible) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handler covers keyboard close
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 50,
        background: "oklch(0 0 0 / 0.4)",
        backdropFilter: "blur(4px)",
        animation: closing
          ? "backdrop-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : "backdrop-in 200ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      onClick={handleClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only prevents backdrop close */}
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
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search or enter URL..."
          aria-label="Search or enter URL"
          className="w-full outline-none placeholder:text-glass-text-hint"
          style={{
            background: "transparent",
            color: "var(--glass-text-primary)",
            fontSize: "var(--text-md)",
            padding: "1rem 1.25rem",
            border: "none",
            fontFamily: "inherit",
          }}
          onKeyDown={handleKeyDown}
          onInput={handleInputChange}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Resolution indicator */}
        {resolution.type !== "empty" && (
          <div
            style={{
              padding: "0 1.25rem 0.5rem",
              fontSize: "var(--text-sm)",
              color: "var(--glass-text-muted)",
            }}
          >
            {resolution.type === "search" ? (
              <span>
                Search with{" "}
                <strong style={{ color: "var(--glass-text-default)" }}>
                  {resolution.provider}
                </strong>
              </span>
            ) : (
              <span>
                Navigate to{" "}
                <strong
                  className="truncate"
                  style={{
                    color: "var(--glass-text-default)",
                    maxWidth: 400,
                    display: "inline-block",
                    verticalAlign: "bottom",
                  }}
                >
                  {resolution.url}
                </strong>
              </span>
            )}
          </div>
        )}

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--glass-border)",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {suggestions.map((s, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled on input
              <div
                key={s.url}
                className="flex items-center cursor-pointer"
                style={{
                  gap: "0.625rem",
                  padding: "0.5rem 1.25rem",
                  background: i === selectedSuggestion ? "var(--glass-hover)" : undefined,
                  fontSize: "var(--text-sm)",
                }}
                onClick={() => executeCommand(s.url, false)}
              >
                <span className="truncate flex-1" style={{ color: "var(--glass-text-default)" }}>
                  {s.title}
                </span>
                <span
                  className="truncate shrink-0"
                  style={{
                    color: "var(--glass-text-muted)",
                    fontSize: "var(--text-xs)",
                    maxWidth: 200,
                  }}
                >
                  {s.url}
                </span>
              </div>
            ))}
          </div>
        )}

        <div
          className="flex items-center justify-between"
          style={{
            padding: "0.5rem 1.25rem 0.75rem",
            fontSize: "var(--text-sm)",
            color: "var(--glass-text-muted)",
            borderTop: "1px solid var(--glass-border)",
          }}
        >
          <span>Enter = new tab &middot; Ctrl+Enter = current tab &middot; Esc = close</span>
        </div>
      </div>
    </div>
  );
}

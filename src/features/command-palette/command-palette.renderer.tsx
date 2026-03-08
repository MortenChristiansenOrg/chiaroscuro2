import { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../settings/settings.store";
import type { Suggestion } from "./command-palette.shared";
import { useCommandPaletteStore } from "./command-palette.store";
import {
  type ProviderConfig,
  type ResolvedInput,
  getBuiltInPages,
  resolveInputDetailed,
} from "./resolve-input";

export function CommandPaletteOverlay() {
  const open = useCommandPaletteStore((s) => s.open);
  const settings = useSettingsStore((s) => s.settings);
  const providerConfig = useMemo<ProviderConfig | undefined>(
    () =>
      settings
        ? { providers: settings.searchProviders, defaultBang: settings.defaultSearchProviderId }
        : undefined,
    [settings],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [status, setStatus] = useState<"hidden" | "open" | "closing">("hidden");
  const [resolution, setResolution] = useState<ResolvedInput>({ type: "empty" });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cancel debounce when palette closes (component stays mounted)
  useEffect(() => {
    if (!open) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
  }, [open]);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setStatus("open");
      setResolution({ type: "empty" });
      setSuggestions([]);
      setSelectedSuggestion(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (status === "hidden") return;
    // Play exit animation then unmount
    setStatus("closing");
    const timer = setTimeout(() => {
      setStatus("hidden");
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }, 150); // --duration-exit
    return () => clearTimeout(timer);
  }, [open, status]);

  const handleClose = () => {
    window.chiaroscuro.sendCommand("command-palette:hide", undefined);
  };

  // Global Esc handler — works even if input loses focus
  useEffect(() => {
    if (status !== "open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.chiaroscuro.sendCommand("command-palette:hide", undefined);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status]);

  // Focus trap — nothing else should be focusable while palette is open
  useEffect(() => {
    if (status !== "open") return;
    const input = inputRef.current;
    if (!input) return;
    const refocus = () => requestAnimationFrame(() => input.focus());
    input.addEventListener("blur", refocus);
    return () => input.removeEventListener("blur", refocus);
  }, [status]);

  const handleInputChange = () => {
    const value = inputRef.current?.value ?? "";
    const trimmed = value.trim();
    setResolution(resolveInputDetailed(value, providerConfig));
    setSelectedSuggestion(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // "/" prefix → show only built-in pages (filtered by remainder)
    if (trimmed.startsWith("/")) {
      const filter = trimmed.toLowerCase();
      const pages = getBuiltInPages()
        .filter(
          (p) =>
            p.route.toLowerCase().includes(filter) ||
            p.title.toLowerCase().includes(filter.slice(1)),
        )
        .map((p) => ({ url: p.route, title: p.title, visitCount: 0 }));
      setSuggestions(pages);
      return;
    }

    // Debounce suggestion search
    if (trimmed.length >= 2) {
      debounceRef.current = setTimeout(() => {
        window.chiaroscuro
          .sendCommand("command-palette:search-visits", { query: trimmed })
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

  if (status === "hidden") return null;
  const closing = status === "closing";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handler covers keyboard close
    <div
      data-testid="command-palette"
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

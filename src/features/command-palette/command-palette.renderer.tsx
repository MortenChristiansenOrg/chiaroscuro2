import { useCallback, useEffect, useRef, useState } from "react";
import { useCommandPaletteStore } from "./command-palette.store";

export function CommandPaletteOverlay() {
  const open = useCommandPaletteStore((s) => s.open);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
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
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }, 150); // --duration-exit
    return () => clearTimeout(timer);
  }, [open, visible]);

  const handleClose = useCallback(() => {
    window.chiaroscuro.sendCommand("command-palette:hide", undefined);
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

  const handleSubmit = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;

    const value = inputRef.current?.value;
    if (!value?.trim()) return;

    window.chiaroscuro.sendCommand("command-palette:execute", {
      command: value,
      inCurrentTab: e.ctrlKey || e.metaKey,
    });

    window.chiaroscuro.sendCommand("command-palette:hide", undefined);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

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
          onKeyDown={handleSubmit}
          autoComplete="off"
          spellCheck={false}
        />
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

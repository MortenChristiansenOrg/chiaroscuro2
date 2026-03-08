import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import { FIND_NEXT, FIND_PREVIOUS, FIND_STOP, type FindTextCommands } from "./find-text.shared";
import { useFindTextStore } from "./find-text.store";

type UsedCommands = Pick<
  FindTextCommands,
  typeof FIND_NEXT | typeof FIND_PREVIOUS | typeof FIND_STOP
>;

function sendCommand<K extends keyof UsedCommands>(
  name: K,
  ...args: UsedCommands[K]["payload"] extends undefined ? [] : [payload: UsedCommands[K]["payload"]]
) {
  void window.chiaroscuro.sendCommand(name, args[0]);
}

export function FindBar() {
  const active = useFindTextStore((s) => s.active);
  const activeMatchOrdinal = useFindTextStore((s) => s.activeMatchOrdinal);
  const matches = useFindTextStore((s) => s.matches);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (active) {
      setText("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [active]);

  const handleInput = (value: string) => {
    setText(value);
    if (value) {
      sendCommand(FIND_NEXT, { text: value });
    }
  };

  const handleNext = () => {
    if (text) sendCommand(FIND_NEXT, { text });
  };

  const handlePrevious = () => {
    if (text) sendCommand(FIND_PREVIOUS, { text });
  };

  const handleClose = () => {
    sendCommand(FIND_STOP);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handlePrevious();
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleNext();
    } else if (e.key === "F3" && e.shiftKey) {
      e.preventDefault();
      handlePrevious();
    } else if (e.key === "F3") {
      e.preventDefault();
      handleNext();
    }
  };

  const hasText = text.length > 0;
  const matchLabel = hasText ? `${activeMatchOrdinal} / ${matches}` : "";

  const navBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "var(--click-target-min)",
    height: "var(--click-target-min)",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    transition:
      "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
  };

  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        transition:
          "opacity var(--duration-normal) var(--ease-out), scale var(--duration-normal) var(--ease-out)",
        opacity: active ? 1 : 0,
        scale: active ? "1" : "0.96",
        pointerEvents: active ? "auto" : "none",
      }}
    >
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
        {/* Search icon */}
        <div
          className="flex items-center justify-center shrink-0 text-glass-text-muted"
          style={{
            width: "var(--click-target-min)",
            height: "var(--click-target-min)",
          }}
        >
          <Icon name="magnifying-glass" css={{ fontSize: "var(--icon-size-default)" }} />
        </div>

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Find in page"
          className="bg-transparent text-glass-text-primary placeholder:text-glass-text-hint outline-none"
          style={{
            width: 160,
            height: "var(--click-target-min)",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-mono)",
            border: "none",
            padding: 0,
          }}
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Match count */}
        {matchLabel && (
          <span
            className="shrink-0 text-glass-text-muted"
            style={{
              fontSize: "var(--text-xs)",
              paddingRight: "0.25rem",
              minWidth: "2.5rem",
              textAlign: "right",
            }}
          >
            {matchLabel}
          </span>
        )}

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: "0.75rem",
            background: "var(--glass-border)",
            marginInline: "0.125rem",
          }}
        />

        {/* Previous match */}
        <button
          type="button"
          style={navBtnStyle}
          className="text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
          tabIndex={-1}
          onClick={handlePrevious}
          aria-label="Previous match"
          data-tip="Previous match"
        >
          <Icon name="chevron-up" css={{ fontSize: "var(--icon-size-default)" }} />
        </button>

        {/* Next match */}
        <button
          type="button"
          style={navBtnStyle}
          className="text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
          tabIndex={-1}
          onClick={handleNext}
          aria-label="Next match"
          data-tip="Next match"
        >
          <Icon name="chevron-down" css={{ fontSize: "var(--icon-size-default)" }} />
        </button>

        {/* Close */}
        <button
          type="button"
          style={navBtnStyle}
          className="text-glass-text-muted hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed"
          tabIndex={-1}
          onClick={handleClose}
          aria-label="Close find bar"
          data-tip="Close (Esc)"
        >
          <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
        </button>
      </div>
    </div>
  );
}

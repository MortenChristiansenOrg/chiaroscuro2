import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import { useTabsStore } from "../tabs/tabs.store";
import { TERMINAL_CLEAR, TERMINAL_TOGGLE, type TerminalLine } from "./terminal.shared";
import { useTerminalStore } from "./terminal.store";

const EMPTY_LINES: TerminalLine[] = [];

function sendCommand(name: string, payload: unknown) {
  void window.chiaroscuro.sendCommand(name, payload);
}

function TerminalOutput({ lines }: { lines: TerminalLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll depends on lines changing
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ padding: "0.5rem 0.75rem" }}
    >
      {lines.map((line, i) => (
        <div
          key={`${i}-${line.text.slice(0, 20)}`}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.6,
            color:
              line.type === "stderr"
                ? "var(--destructive-foreground)"
                : "var(--content-text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}

function TerminalInput() {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === "/clear") {
      sendCommand(TERMINAL_CLEAR, undefined);
    }
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.75rem",
        borderTop: "1px solid var(--border)",
      }}
    >
      <Icon
        name="chevron-right"
        css={{
          fontSize: "var(--icon-size-default)",
          color: "var(--content-text-muted)",
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="/clear"
        aria-label="Terminal command"
        className="flex-1"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-sm)",
          color: "var(--foreground)",
          padding: "0.25rem 0",
        }}
      />
    </form>
  );
}

const headerButtonStyle: React.CSSProperties = {
  width: "var(--click-target-min)",
  height: "var(--click-target-min)",
  border: "none",
  borderRadius: "var(--radius-sm, 0.25rem)",
  color: "var(--content-text-muted)",
  transition: "color var(--duration-fast), background var(--duration-fast)",
};

export function TerminalPanel() {
  const visible = useTerminalStore((s) => s.visible);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const buffers = useTerminalStore((s) => s.buffers);
  const lines = (activeTabId ? buffers.get(activeTabId) : undefined) ?? EMPTY_LINES;

  if (!visible) return null;

  return (
    <div
      className="dark flex flex-col"
      style={{
        height: "14rem",
        minHeight: "6rem",
        background: "var(--content-bg)",
        borderTop: "1px solid var(--border)",
        borderRadius: "0 0 var(--radius) var(--radius)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: "0.25rem 0.75rem",
          gap: "0.375rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Icon
          name="terminal"
          css={{
            fontSize: "var(--icon-size-default)",
            color: "var(--content-text-muted)",
          }}
        />
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--content-text-muted)",
          }}
        >
          Terminal
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => sendCommand(TERMINAL_CLEAR, undefined)}
          className="flex items-center justify-center bg-transparent cursor-pointer hover:text-[var(--foreground)]"
          style={headerButtonStyle}
          aria-label="Clear terminal"
          data-tip="Clear"
        >
          <Icon name="trash-can" css={{ fontSize: "var(--icon-size-default)" }} />
        </button>
        <button
          type="button"
          onClick={() => sendCommand(TERMINAL_TOGGLE, undefined)}
          className="flex items-center justify-center bg-transparent cursor-pointer hover:text-[var(--foreground)]"
          style={headerButtonStyle}
          aria-label="Close terminal"
          data-tip="Close"
        >
          <Icon name="xmark" css={{ fontSize: "var(--icon-size-default)" }} />
        </button>
      </div>

      {/* Output area */}
      <TerminalOutput lines={lines} />

      {/* Command input */}
      <TerminalInput />
    </div>
  );
}

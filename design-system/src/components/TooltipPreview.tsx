import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Self-contained tooltip renderer for the design system.
 * Mimics the real TooltipLayer behavior (data-tip hover, 400ms delay,
 * positioned below trigger, flips above if needed) but renders in-browser
 * instead of via IPC to the main process.
 */
export function TooltipPreview({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const timerRef = useRef(0);
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const show = (el: Element) => {
      if (el === targetRef.current) return;
      window.clearTimeout(timerRef.current);
      targetRef.current = el;

      timerRef.current = window.setTimeout(() => {
        const text = el.getAttribute("data-tip");
        if (!text) return;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setTooltip({
          text,
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.bottom + 6 - containerRect.top,
        });
      }, 400);
    };

    const hide = () => {
      window.clearTimeout(timerRef.current);
      targetRef.current = null;
      setTooltip(null);
    };

    const onOver = (e: Event) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (!el) {
        if (targetRef.current) hide();
        return;
      }
      show(el);
    };

    const onDown = () => hide();

    container.addEventListener("mouseover", onOver);
    container.addEventListener("mouseleave", hide);
    container.addEventListener("mousedown", onDown);
    return () => {
      container.removeEventListener("mouseover", onOver);
      container.removeEventListener("mouseleave", hide);
      container.removeEventListener("mousedown", onDown);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {children}
      {tooltip && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-50%)",
            background: "oklch(0.16 0 0 / 0.92)",
            backdropFilter: "blur(var(--glass-backdrop-blur))",
            color: "oklch(0.88 0 0)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            letterSpacing: "0.01em",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            animation: "tip-in var(--duration-enter) var(--ease-out)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

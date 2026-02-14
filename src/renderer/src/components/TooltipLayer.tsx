import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Tip {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

let nextTooltipId = 0;

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timerRef = useRef(0);
  const targetRef = useRef<Element | null>(null);
  const idRef = useRef("");
  if (!idRef.current) idRef.current = `tooltip-${++nextTooltipId}`;

  useEffect(() => {
    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text) {
        if (targetRef.current) hide();
        return;
      }

      // Same element — update text in-place if data-tip changed (e.g. Maximize → Restore)
      if (el === targetRef.current) {
        setTip((prev) => (prev && prev.text !== text ? { ...prev, text } : prev));
        return;
      }

      window.clearTimeout(timerRef.current);

      // Clean up previous target
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
      }
      targetRef.current = el;

      timerRef.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const edgePad = 16; // 1rem distance from any application edge
        const above = r.bottom + 32 > window.innerHeight - edgePad;
        el.setAttribute("aria-describedby", idRef.current);
        setTip({
          text,
          x: Math.max(edgePad, Math.min(window.innerWidth - edgePad, r.left + r.width / 2)),
          y: above
            ? Math.max(edgePad, r.top - 6)
            : Math.min(window.innerHeight - edgePad, r.bottom + 6),
          above,
        });
      }, 400);
    };

    const hide = () => {
      window.clearTimeout(timerRef.current);
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
      }
      targetRef.current = null;
      setTip(null);
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (!el) {
        if (targetRef.current) hide();
        return;
      }
      show(el);
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (!el) return;
      show(el);
    };

    const onFocusOut = () => {
      hide();
    };

    // Dismiss tooltip on click
    const onDown = () => {
      hide();
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.clearTimeout(timerRef.current);
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
      }
    };
  }, []);

  if (!tip) return null;

  return createPortal(
    <div
      id={idRef.current}
      role="tooltip"
      style={{
        position: "fixed",
        top: tip.y,
        left: tip.x,
        transform: `translateX(-50%)${tip.above ? " translateY(-100%)" : ""}`,
        padding: "4px 10px",
        borderRadius: "var(--radius-sm)",
        background: "oklch(0.16 0 0 / 0.92)",
        backdropFilter: "blur(var(--glass-backdrop-blur))",
        color: "oklch(0.88 0 0)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        maxWidth: "min(320px, calc(100vw - 16px))",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        zIndex: "var(--z-tooltip)" as unknown as number,
        animation: "tip-in 0.12s ease",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

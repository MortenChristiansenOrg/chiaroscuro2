import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Tip {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timerRef = useRef(0);
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (el === targetRef.current) return;

      window.clearTimeout(timerRef.current);
      targetRef.current = el;

      if (!el) {
        setTip(null);
        return;
      }
      const text = el.getAttribute("data-tip");
      if (!text) {
        setTip(null);
        return;
      }

      timerRef.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const above = r.bottom + 32 > window.innerHeight;
        setTip({
          text,
          x: Math.max(8, Math.min(window.innerWidth - 8, r.left + r.width / 2)),
          y: above ? r.top - 6 : r.bottom + 6,
          above,
        });
      }, 500);
    };

    const onLeave = () => {
      window.clearTimeout(timerRef.current);
      targetRef.current = null;
      setTip(null);
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseleave", onLeave);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!tip) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: tip.y,
        left: tip.x,
        transform: `translateX(-50%)${tip.above ? " translateY(-100%)" : ""}`,
        padding: "4px 10px",
        borderRadius: 7,
        background: "oklch(0.16 0 0 / 0.92)",
        backdropFilter: "blur(12px)",
        color: "oklch(0.88 0 0)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 99999,
        animation: "tip-in 0.12s ease",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

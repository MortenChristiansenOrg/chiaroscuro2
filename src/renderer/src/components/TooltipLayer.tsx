import { useEffect, useRef } from "react";

/** Minimum gap between tooltip and any application edge. */
const EDGE_MARGIN = 6;

/** Reusable hidden element for measuring tooltip text dimensions. */
let measureEl: HTMLSpanElement | null = null;

function measureText(text: string): { width: number; height: number } {
  if (!measureEl) {
    measureEl = document.createElement("span");
    measureEl.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;
font:500 0.6875rem/1.4 var(--font-sans);
letter-spacing:0.01em;padding:4px 10px;white-space:nowrap`;
    document.body.appendChild(measureEl);
  }
  measureEl.textContent = text;
  return { width: measureEl.offsetWidth, height: measureEl.offsetHeight };
}

let nextTooltipId = 0;

export function TooltipLayer() {
  const timerRef = useRef(0);
  const targetRef = useRef<Element | null>(null);
  const shownRef = useRef(false);
  const textRef = useRef("");
  const ariaRef = useRef<HTMLDivElement>(null);
  const idRef = useRef("");
  if (!idRef.current) idRef.current = `tooltip-${++nextTooltipId}`;

  useEffect(() => {
    const showTip = (text: string, r: DOMRect) => {
      const { width, height } = measureText(text);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const above = r.bottom + 6 + height > vh - EDGE_MARGIN;

      let x = r.left + r.width / 2 - width / 2;
      let y = above ? r.top - 6 - height : r.bottom + 6;

      // Clamp so tooltip never touches the application edge
      x = Math.max(EDGE_MARGIN, Math.min(vw - width - EDGE_MARGIN, x));
      y = Math.max(EDGE_MARGIN, Math.min(vh - height - EDGE_MARGIN, y));

      textRef.current = text;
      shownRef.current = true;
      if (ariaRef.current) ariaRef.current.textContent = text;

      window.chiaroscuro.sendCommand("tooltip:show", {
        text,
        x,
        y,
        width: width + 2,
        height: height + 2,
      });
    };

    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text) {
        if (targetRef.current) hide();
        return;
      }

      // Same element — update text in-place if data-tip changed (e.g. Maximize → Restore)
      if (el === targetRef.current) {
        if (shownRef.current && text !== textRef.current) {
          showTip(text, el.getBoundingClientRect());
        }
        return;
      }

      window.clearTimeout(timerRef.current);

      // Clean up previous target
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
      }
      targetRef.current = el;

      timerRef.current = window.setTimeout(() => {
        el.setAttribute("aria-describedby", idRef.current);
        showTip(text, el.getBoundingClientRect());
      }, 400);
    };

    const hide = () => {
      window.clearTimeout(timerRef.current);
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
      }
      targetRef.current = null;
      if (shownRef.current) {
        shownRef.current = false;
        textRef.current = "";
        if (ariaRef.current) ariaRef.current.textContent = "";
        window.chiaroscuro.sendCommand("tooltip:hide", undefined);
      }
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

  // Hidden element for aria-describedby accessibility
  return (
    <div
      ref={ariaRef}
      id={idRef.current}
      role="tooltip"
      style={{
        position: "absolute",
        left: -9999,
        width: 1,
        height: 1,
        overflow: "hidden",
      }}
    />
  );
}

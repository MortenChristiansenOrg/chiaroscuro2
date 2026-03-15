import { useLayoutEffect, useRef, useState } from "react";

type Phase = "closed" | "entering" | "open" | "exiting";

const DURATION = 200;

interface SubTabFrameProps {
  /** Whether the sub-tab overlay is visible. */
  isOpen: boolean;
  /** Called when the backdrop is clicked. */
  onBackdropClick?: () => void;
  /** Called after the open animation finishes. */
  onOpened?: () => void;
  /** Called after the close animation finishes. */
  onClosed?: () => void;
  /** Ref forwarded to the frame element (app uses this for bounds reporting). */
  frameRef?: React.Ref<HTMLDivElement>;
  /** Content rendered inside the frame (demo uses this; app leaves it empty for native WCV). */
  children?: React.ReactNode;
  /** Buttons rendered beside the frame (demo renders close/promote; app uses native overlay). */
  buttons?: React.ReactNode;
  /** Width of the button column spacer when no `buttons` are provided. Default 48. */
  buttonColumnWidth?: number;
}

/**
 * Shared presentational component for the sub-tab overlay.
 * Handles the backdrop, frame card positioning, and fade animation.
 * Used by both the app renderer and the design-system demo.
 *
 * Uses the Web Animations API so the animation is immune to the global
 * `prefers-reduced-motion` CSS rule that sets `transition-duration: 0.01ms !important`.
 */
export function SubTabFrame({
  isOpen,
  onBackdropClick,
  onOpened,
  onClosed,
  frameRef,
  children,
  buttons,
  buttonColumnWidth = 48,
}: SubTabFrameProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  const internalFrameRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const animationsRef = useRef<Animation[]>([]);

  const setFrameRefCb = (el: HTMLDivElement | null) => {
    internalFrameRef.current = el;
    if (typeof frameRef === "function") frameRef(el);
    else if (frameRef) (frameRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  function cancelAnimations() {
    for (const a of animationsRef.current) a.cancel();
    animationsRef.current = [];
  }

  // ── Enter animation ──────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!isOpen) return;
    setPhase("entering");
  }, [isOpen]);

  useLayoutEffect(() => {
    if (phase !== "entering") return;

    const frame = internalFrameRef.current;
    const backdrop = backdropRef.current;
    if (!frame || !backdrop) return;

    cancelAnimations();

    const frameAnim = frame.animate(
      [
        { opacity: 0, transform: "scale(0.88)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: DURATION, easing: "ease-out", fill: "forwards" },
    );

    const backdropAnim = backdrop.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION,
      easing: "ease-out",
      fill: "forwards",
    });

    animationsRef.current = [frameAnim, backdropAnim];

    frameAnim.finished.then(() => {
      onOpened?.();
    });

    setPhase("open");
  });

  // ── Exit animation ───────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: phase drives exit
  useLayoutEffect(() => {
    if (isOpen || phase !== "open") return;
    setPhase("exiting");

    const frame = internalFrameRef.current;
    const backdrop = backdropRef.current;
    if (!frame || !backdrop) return;

    cancelAnimations();

    const frameAnim = frame.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.88)" },
      ],
      { duration: DURATION, easing: "ease-in", fill: "forwards" },
    );

    const backdropAnim = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION,
      easing: "ease-in",
      fill: "forwards",
    });

    animationsRef.current = [frameAnim, backdropAnim];

    frameAnim.finished.then(() => {
      setPhase("closed");
      onClosed?.();
    });
  }, [isOpen]);

  if (phase === "closed") return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: "var(--z-overlay)" as never,
        pointerEvents: "auto",
      }}
    >
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled via platform shortcut */}
      <div
        ref={backdropRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "oklch(0 0 0 / 0.5)",
          opacity: 0,
        }}
        onClick={onBackdropClick}
      />

      {/* Frame + buttons container */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: click stops propagation to backdrop only */}
      <div
        style={{
          position: "absolute",
          top: "7.5%",
          left: "8%",
          right: "4%",
          height: "85%",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sub-tab frame */}
        <div
          ref={setFrameRefCb}
          style={{
            flex: 1,
            height: "100%",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-elevated)",
            background: "var(--content-bg)",
            overflow: "hidden",
            opacity: 0,
          }}
        >
          {children}
        </div>

        {/* Buttons or spacer */}
        {buttons ?? <div style={{ flexShrink: 0, width: buttonColumnWidth }} />}
      </div>
    </div>
  );
}

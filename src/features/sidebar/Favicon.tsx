import { useEffect, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import type { FaSolidIcon } from "../../shared/fa-icons.generated";
import type { Tab } from "../tabs/tabs.shared";

// ── Helpers ─────────────────────────────────────────────────────

export function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// ── Built-in page icons ─────────────────────────────────────────

const builtInIcons: Record<string, FaSolidIcon> = {
  "app:settings": "gear",
};

// ── Components ──────────────────────────────────────────────────

export function LetterAvatar({ label, hue }: { label: string; hue: number }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-full"
      style={{
        width: 16,
        height: 16,
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        color: "var(--glass-text-primary)",
        background: `oklch(0.55 0.15 ${hue})`,
      }}
    >
      {label}
    </div>
  );
}

export function Favicon({ tab }: { tab: Pick<Tab, "favicon" | "title" | "url"> }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [retries, setRetries] = useState(0);
  const [lastFavicon, setLastFavicon] = useState(tab.favicon);

  // Reset failure state when favicon URL changes
  if (tab.favicon !== lastFavicon) {
    setLastFavicon(tab.favicon);
    setImgFailed(false);
    setRetries(0);
  }

  // Retry localhost favicons (dev servers may not be ready yet on restore)
  useEffect(() => {
    if (!imgFailed || retries >= 3 || !tab.favicon) return;
    try {
      const u = new URL(tab.favicon);
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return;
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      setImgFailed(false);
      setRetries((r) => r + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [imgFailed, retries, tab.favicon]);

  const letter = tab.title?.[0]?.toUpperCase() || tab.url?.[0]?.toUpperCase() || "?";
  const hue = hashToHue(tab.url || tab.title || "");

  if (tab.favicon && !imgFailed) {
    return (
      <img
        src={tab.favicon}
        alt=""
        className="shrink-0 rounded-full"
        style={{ width: 16, height: 16 }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const builtInIcon = builtInIcons[tab.url];
  if (builtInIcon) {
    return (
      <div className="shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }}>
        <Icon name={builtInIcon} css={{ fontSize: 12, color: "var(--glass-text-muted)" }} />
      </div>
    );
  }

  return <LetterAvatar label={letter} hue={hue} />;
}

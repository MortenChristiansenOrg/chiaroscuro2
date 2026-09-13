import { useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
export function ExtensionIcon({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span
      style={{
        width: "2.5rem",
        height: "2.5rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderRadius: "var(--radius-sm)",
        background: "var(--muted)",
        overflow: "hidden",
      }}
    >
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Icon
          name="puzzle-piece"
          style="solid"
          css={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}
        />
      )}
    </span>
  );
}

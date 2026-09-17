import { useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import bitwardenIcon from "./assets/bitwarden.png";
import { BITWARDEN_ID } from "./extensions.shared";

export function ExtensionIcon({ url, id }: { url?: string; id?: string }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const source = [url, id === BITWARDEN_ID ? bitwardenIcon : undefined].find(
    (candidate) => candidate && !failedUrls.includes(candidate),
  );
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
      {source ? (
        <img
          src={source}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={() => setFailedUrls((urls) => [...urls, source])}
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

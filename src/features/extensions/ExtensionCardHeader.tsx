import type { ReactNode } from "react";
import { ExtensionIcon } from "./ExtensionIcon";
import { BITWARDEN_ID } from "./extensions.shared";
import "./extensions.css";

export function ExtensionCardHeader({
  name,
  description,
  id = BITWARDEN_ID,
  iconUrl,
  children,
}: {
  name: string;
  description: string;
  id?: string;
  iconUrl?: string;
  children?: ReactNode;
}) {
  return (
    <div className="extension-card-header">
      <ExtensionIcon id={id} url={iconUrl} />
      <div className="extension-card-identity">
        <h2>{name}</h2>
        <p className="extension-secondary">{description}</p>
      </div>
      {children}
    </div>
  );
}

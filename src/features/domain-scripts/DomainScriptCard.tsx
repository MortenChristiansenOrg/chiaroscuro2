import type { DomainScript, DomainScriptsExecutedEvent } from "./domain-scripts.shared";
import { scriptButtonClass } from "./domain-scripts.ui";

interface DomainScriptCardProps {
  script: DomainScript;
  result?: DomainScriptsExecutedEvent;
  busy?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function DomainScriptCard({
  script,
  result,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: DomainScriptCardProps) {
  return (
    <article
      aria-label={script.name}
      className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--content-bg)] p-4 text-[length:var(--text-sm)] text-[var(--foreground)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 break-words text-[length:var(--text-base)] font-semibold">
            {script.name}
          </h3>
          <p className="m-0 mt-1.5 break-words text-[var(--muted-foreground)]">
            {script.runAt === "page-load" ? "On page load" : "Manual"}
            {" · "}
            <code className="font-[family-name:var(--font-mono)]">{script.pathPattern}</code>
            {script.runAt === "manual" && script.alias && ` · ${script.alias}`}
            {script.runAt === "manual" && script.shortcut && ` · ${script.shortcut}`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={`Enable ${script.name}`}
          aria-checked={script.enabled}
          disabled={busy}
          onClick={onToggle}
          className={scriptButtonClass}
        >
          <Icon name={script.enabled ? "toggle-on" : "toggle-off"} style="solid" />
          {script.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      {result && (
        <p
          role={result.status === "failed" ? "alert" : "status"}
          className={`m-0 break-words ${result.status === "failed" ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}
        >
          {result.status === "failed"
            ? `Last run failed: ${result.error ?? "Unknown error"}`
            : "Last run succeeded."}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-label={`Edit ${script.name}`}
          disabled={busy}
          onClick={onEdit}
          className={scriptButtonClass}
        >
          Edit
        </button>
        <button
          type="button"
          aria-label={`Delete ${script.name}`}
          disabled={busy}
          onClick={onDelete}
          className={`${scriptButtonClass} text-[var(--destructive)]`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

import { Icon } from "../../renderer/src/components/Icon";

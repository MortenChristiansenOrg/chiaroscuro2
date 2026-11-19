import { scriptButtonClass } from "../domain-scripts/domain-scripts.ui";
import type { SyncIssue } from "./sync.shared";

export type ConflictChoice = "this-machine" | "other-machine";

/** Items sync couldn't settle on its own, with a choice for each conflict. */
export function SyncIssueList({
  issues,
  disabled = false,
  onResolve,
}: {
  issues: SyncIssue[];
  disabled?: boolean;
  onResolve: (issue: SyncIssue, keep: ConflictChoice) => void;
}) {
  if (!issues.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[length:var(--text-sm)] font-medium text-[var(--foreground)]">
        Needs attention
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Items that didn't sync">
        {issues.map((issue) => (
          <li
            key={issue.id}
            className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-[length:var(--text-sm)]"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-[var(--foreground)]">{issue.label}</span>
              <span className="text-[var(--muted-foreground)]">{issue.message}</span>
            </div>
            {issue.kind === "conflict" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={scriptButtonClass}
                  disabled={disabled}
                  onClick={() => onResolve(issue, "this-machine")}
                >
                  Keep this machine's version
                </button>
                <button
                  type="button"
                  className={scriptButtonClass}
                  disabled={disabled}
                  onClick={() => onResolve(issue, "other-machine")}
                >
                  Use the other machine's version
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

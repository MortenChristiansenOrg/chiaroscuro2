import { useId } from "react";
import { scriptButtonClass } from "../domain-scripts/domain-scripts.ui";
import type { SyncIssue } from "./sync.shared";

export type ConflictChoice = "this-machine" | "other-machine";

/**
 * Buttons that stay focusable while a command runs (`aria-disabled`), so focus isn't lost;
 * handlers ignore clicks meanwhile.
 */
export const syncButtonClass = `${scriptButtonClass} aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-[var(--background)]`;

/** Items sync couldn't settle on its own, with a choice for each conflict. */
export function SyncIssueList({
  issues,
  busy = false,
  headingRef,
  onResolve,
}: {
  issues: SyncIssue[];
  /** While a choice is being applied, further clicks are ignored. */
  busy?: boolean;
  /** Receives focus after a choice, so keyboard users keep their place. */
  headingRef?: React.Ref<HTMLHeadingElement>;
  onResolve: (issue: SyncIssue, keep: ConflictChoice) => void;
}) {
  const id = useId();
  if (!issues.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3
        id={`${id}-heading`}
        ref={headingRef}
        tabIndex={-1}
        className="m-0 text-[length:var(--text-sm)] font-medium text-[var(--foreground)] outline-none"
      >
        Needs attention
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-labelledby={`${id}-heading`}>
        {issues.map((issue, index) => (
          <li
            key={issue.id}
            className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-[length:var(--text-sm)]"
          >
            <div className="flex flex-col gap-1">
              <span id={`${id}-${index}`} className="font-medium text-[var(--foreground)]">
                {issue.label}
              </span>
              <span className="text-[var(--content-text-secondary)]">{issue.message}</span>
            </div>
            {issue.kind === "conflict" && (
              // biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the row
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-${index}`}>
                {(
                  [
                    ["this-machine", "Keep this machine's version"],
                    ["other-machine", "Use the other machine's version"],
                  ] as const
                ).map(([keep, label]) => (
                  <button
                    key={keep}
                    type="button"
                    className={syncButtonClass}
                    aria-disabled={busy}
                    onClick={() => {
                      if (!busy) onResolve(issue, keep);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

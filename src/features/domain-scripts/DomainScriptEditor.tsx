import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { DomainScript } from "./domain-scripts.shared";
import { scriptButtonClass, scriptErrorMessage, scriptInputClass } from "./domain-scripts.ui";

interface DomainScriptEditorProps {
  domain: string;
  script?: DomainScript;
  onSave: (script: DomainScript) => Promise<void>;
  onCancel: () => void;
}

export function DomainScriptEditor({ domain, script, onSave, onCancel }: DomainScriptEditorProps) {
  const fieldId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DomainScript>(
    () =>
      script ?? {
        id: crypto.randomUUID(),
        domain,
        name: "",
        source:
          "// Change this page or copy text.\nconst title = document.querySelector('h1')?.textContent;\nif (title) await copy(title);",
        enabled: true,
        runAt: "manual",
        pathPattern: "/*",
        alias: "",
        shortcut: "",
      },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        pathPattern: draft.pathPattern.trim(),
        alias: draft.runAt === "manual" ? draft.alias.trim() : "",
        shortcut: draft.runAt === "manual" ? draft.shortcut.trim() : "",
      });
    } catch (error) {
      setError(scriptErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      aria-label={script ? `Edit ${script.name}` : "New script"}
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) {
          event.preventDefault();
          onCancel();
        }
      }}
      className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--content-bg)] p-4 text-[length:var(--text-sm)] text-[var(--foreground)]"
    >
      <h3 className="m-0 text-[length:var(--text-base)] font-semibold">
        {script ? "Edit script" : "New script"}
      </h3>
      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <label htmlFor={`${fieldId}-name`} className="flex flex-col gap-1.5">
          Name
          <input
            id={`${fieldId}-name`}
            ref={nameRef}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            required
            maxLength={120}
            placeholder="Copy issue as Markdown"
            className={scriptInputClass}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor={`${fieldId}-run`} className="flex flex-col gap-1.5">
            Run
            <select
              id={`${fieldId}-run`}
              value={draft.runAt}
              onChange={(event) =>
                setDraft({ ...draft, runAt: event.target.value as DomainScript["runAt"] })
              }
              className={scriptInputClass}
            >
              <option value="manual">Manual</option>
              <option value="page-load">On page load</option>
            </select>
          </label>
          <label htmlFor={`${fieldId}-path`} className="flex flex-col gap-1.5">
            Path pattern
            <input
              id={`${fieldId}-path`}
              value={draft.pathPattern}
              onChange={(event) => setDraft({ ...draft, pathPattern: event.target.value })}
              required
              pattern="/.*"
              aria-describedby={`${fieldId}-path-help`}
              className={scriptInputClass}
            />
          </label>
        </div>
        <p id={`${fieldId}-path-help`} className="m-0 text-[var(--muted-foreground)]">
          Applies to {domain} only. Use /* for every path or /issues/* for selected paths.
        </p>
        <label htmlFor={`${fieldId}-source`} className="flex flex-col gap-1.5">
          JavaScript
          <textarea
            id={`${fieldId}-source`}
            value={draft.source}
            onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            required
            rows={10}
            spellCheck={false}
            aria-describedby={`${fieldId}-source-help`}
            className={`${scriptInputClass} resize-y font-[family-name:var(--font-mono)] leading-relaxed`}
          />
        </label>
        <p id={`${fieldId}-source-help`} className="m-0 text-[var(--muted-foreground)]">
          Use document to read or change the page. Use await copy(text) to copy to the clipboard.
        </p>
        {draft.runAt === "manual" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label htmlFor={`${fieldId}-alias`} className="flex flex-col gap-1.5">
              Alias (optional)
              <input
                id={`${fieldId}-alias`}
                value={draft.alias}
                onChange={(event) => setDraft({ ...draft, alias: event.target.value })}
                placeholder="/copy-issue"
                className={scriptInputClass}
              />
            </label>
            <label htmlFor={`${fieldId}-shortcut`} className="flex flex-col gap-1.5">
              Shortcut (optional)
              <input
                id={`${fieldId}-shortcut`}
                value={draft.shortcut}
                onChange={(event) => setDraft({ ...draft, shortcut: event.target.value })}
                placeholder="Alt+Shift+C"
                className={scriptInputClass}
              />
            </label>
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="m-0 text-[var(--destructive)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={saving} className={scriptButtonClass}>
          {saving ? "Saving…" : "Save script"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={scriptButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

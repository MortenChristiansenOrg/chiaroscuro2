import { useEffect, useRef, useState } from "react";
import { Icon } from "../../renderer/src/components/Icon";
import { DomainScriptCard } from "./DomainScriptCard";
import { DomainScriptEditor } from "./DomainScriptEditor";
import type { DomainScript } from "./domain-scripts.shared";
import { loadDomainScripts, useDomainScriptsStore } from "./domain-scripts.store";
import { scriptButtonClass, scriptErrorMessage } from "./domain-scripts.ui";

export function DomainScriptsSection({ domain }: { domain: string }) {
  const scripts = useDomainScriptsStore((state) => state.scriptsByDomain.get(domain));
  const results = useDomainScriptsStore((state) => state.results);
  const [editor, setEditor] = useState<DomainScript | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadDomainScripts(domain).catch((error: unknown) => {
      if (!cancelled) setError(scriptErrorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  useEffect(() => {
    if (restoreFocusRef.current && editor === null && busyId === null) {
      restoreFocusRef.current = false;
      const previous = returnFocusRef.current;
      (previous?.isConnected ? previous : addButtonRef.current)?.focus();
    }
  }, [editor, busyId]);

  function closeEditor() {
    restoreFocusRef.current = true;
    setEditor(null);
  }

  async function saveScript(script: DomainScript) {
    await window.chiaroscuro.sendCommand("domain-scripts:save", { script });
    setError(null);
    closeEditor();
  }

  async function updateScript(script: DomainScript, remove = false) {
    setBusyId(script.id);
    setError(null);
    try {
      if (remove) {
        await window.chiaroscuro.sendCommand("domain-scripts:remove", { id: script.id });
        returnFocusRef.current = null;
        restoreFocusRef.current = true;
      } else {
        await window.chiaroscuro.sendCommand("domain-scripts:save", {
          script: { ...script, enabled: !script.enabled },
        });
      }
    } catch (error) {
      setError(scriptErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      id="domain-settings-scripts"
      aria-labelledby="domain-scripts-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2
        id="domain-scripts-heading"
        className="m-0 border-b border-[var(--border)] py-2 text-[length:var(--text-sm)] font-semibold uppercase tracking-[0.05em] text-[var(--muted-foreground)]"
      >
        Scripts
      </h2>
      <p className="m-0 text-[length:var(--text-sm)] leading-relaxed text-[var(--muted-foreground)]">
        Personal actions for {domain}. Run manual scripts from the command palette while viewing a
        matching page, or run automatically on page load.
      </p>
      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-sm)] text-[var(--destructive)]">
          {error}
        </p>
      )}
      {!scripts && !error && (
        <p
          role="status"
          className="m-0 text-[length:var(--text-sm)] text-[var(--muted-foreground)]"
        >
          Loading scripts…
        </p>
      )}
      {scripts?.length === 0 && !editor && (
        <p className="m-0 text-[length:var(--text-sm)] text-[var(--muted-foreground)]">
          No scripts yet. Add an action or automate a page change.
        </p>
      )}
      {scripts?.map((script) => (
        <DomainScriptCard
          key={script.id}
          script={script}
          result={results.get(script.id)}
          busy={busyId !== null || editor !== null}
          onToggle={() => void updateScript(script)}
          onDelete={() => void updateScript(script, true)}
          onEdit={() => {
            returnFocusRef.current = document.activeElement as HTMLElement | null;
            setEditor(script);
          }}
        />
      ))}
      {editor ? (
        <DomainScriptEditor
          key={editor === "new" ? "new" : editor.id}
          domain={domain}
          script={editor === "new" ? undefined : editor}
          onSave={saveScript}
          onCancel={closeEditor}
        />
      ) : (
        <button
          type="button"
          ref={addButtonRef}
          disabled={busyId !== null}
          onClick={() => {
            returnFocusRef.current = addButtonRef.current;
            setEditor("new");
          }}
          className={`${scriptButtonClass} self-start border-dashed`}
        >
          <Icon name="plus" style="solid" />
          Add script
        </button>
      )}
    </section>
  );
}

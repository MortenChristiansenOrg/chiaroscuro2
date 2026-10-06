import { useEffect, useId, useRef, useState } from "react";
import {
  scriptButtonClass,
  scriptErrorMessage,
  scriptInputClass,
} from "../domain-scripts/domain-scripts.ui";
import { reasoningEffortLabel } from "./ai.shared";
import { useAiStore } from "./ai.store";

interface AiRequestPanelProps {
  domain: string;
  kind: "script" | "css";
  source?: string;
  onDraft?: (source: string, previousSource: string) => void;
}
export function AiRequestPanel({ domain, kind, source = "", onDraft }: AiRequestPanelProps) {
  const state = useAiStore((s) => s.state);
  const fieldId = useId();
  const [request, setRequest] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const current = useRef<string | undefined>(undefined);
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  useEffect(() => {
    const unsubscribe = window.chiaroscuro.onEvent("ai:progress", (value: unknown) => {
      const progress = value as { id: string; message: string };
      if (progress.id === current.current) setMessage(progress.message);
    });
    return () => {
      unsubscribe();
      if (current.current)
        void window.chiaroscuro
          .sendCommand("ai:cancel", { id: current.current })
          .catch(console.error);
      current.current = undefined;
    };
  }, []);
  async function generate() {
    const id = crypto.randomUUID();
    current.current = id;
    setRunning(true);
    setError(undefined);
    setMessage("Starting…");
    try {
      const result = await window.chiaroscuro.sendCommand(
        kind === "script" ? "ai:generate-script" : "ai:generate-css",
        { id, domain, request, ...(kind === "script" ? { source } : {}) },
      );
      if (current.current !== id) return;
      if (kind === "script") {
        if (sourceRef.current !== source)
          throw new Error(
            "Your JavaScript changed while AI was working. Your edits were kept; try again.",
          );
        onDraft?.(result as string, source);
        setMessage("Draft ready. Review and save it below.");
      } else setMessage((result as { message: string }).message);
    } catch (error) {
      if (current.current === id) {
        setError(scriptErrorMessage(error));
        setMessage(undefined);
      }
    } finally {
      if (current.current === id) {
        current.current = undefined;
        setRunning(false);
      }
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--content-bg)] p-4 text-[length:var(--text-sm)] text-[var(--foreground)]">
      <h3 className="m-0 text-[length:var(--text-base)] font-semibold">Ask AI</h3>
      {!state.sharing ? (
        <div className="flex flex-col gap-2">
          <p className="m-0">
            Connect ChatGPT and allow plan usage in Settings → AI. Manual editing is available
            below.
          </p>
          <button
            type="button"
            className={scriptButtonClass}
            onClick={() =>
              void window.chiaroscuro.sendCommand("settings:open", undefined).catch(console.error)
            }
          >
            Open AI settings
          </button>
        </div>
      ) : (
        <>
          <p className="m-0 text-[var(--muted-foreground)]">
            Using ChatGPT plan · {state.selection.model} ·{" "}
            {reasoningEffortLabel(state.selection.effort)}.{" "}
            {kind === "script"
              ? "Page structure and your draft will be shared. Generated code is an editable draft."
              : "Page structure and screenshots will be shared. CSS changes are applied, visually checked, and refined automatically; you can stop or restore the prior CSS."}
          </p>
          <label htmlFor={fieldId} className="flex flex-col gap-1.5">
            Describe the change
            <textarea
              id={fieldId}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              disabled={running}
              maxLength={16000}
              rows={3}
              className={`${scriptInputClass} resize-y`}
              placeholder={
                kind === "script"
                  ? "Copy the article title and URL as Markdown"
                  : "Hide the right sidebar and make the article wider"
              }
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={scriptButtonClass}
              disabled={running || !request.trim()}
              onClick={() => void generate()}
            >
              {kind === "script" ? "Generate draft" : "Generate and verify CSS"}
            </button>
            {running && (
              <button
                type="button"
                className={scriptButtonClass}
                onClick={() => {
                  if (current.current)
                    void window.chiaroscuro
                      .sendCommand("ai:cancel", { id: current.current })
                      .catch(console.error);
                }}
              >
                Stop
              </button>
            )}
          </div>
        </>
      )}
      {message && (
        <p role="status" className="m-0">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}

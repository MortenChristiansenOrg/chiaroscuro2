import { useState } from "react";
import {
  SettingItem,
  settingsCategoryHeadingStyle,
} from "../../renderer/src/components/SettingsLayout";
import {
  scriptButtonClass,
  scriptErrorMessage,
  scriptInputClass,
} from "../domain-scripts/domain-scripts.ui";
import { MODEL_DEFAULT_EFFORT, reasoningEffortLabel } from "./ai.shared";
import { useAiStore } from "./ai.store";

export function AiSettingsSection() {
  const state = useAiStore((s) => s.state);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const model = state.models.find((m) => m.slug === state.selection.model);
  const valid = model?.efforts.includes(state.selection.effort);
  async function send(name: string, payload: unknown = {}) {
    setError(undefined);
    setBusy(true);
    try {
      await window.chiaroscuro.sendCommand(name, payload);
    } catch (error) {
      setError(scriptErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="settings-ai">
      <h2 style={settingsCategoryHeadingStyle}>AI</h2>
      <SettingItem
        label="ChatGPT connection"
        description="Use your ChatGPT plan for AI features. Page structure, screenshots, and your request are sent to OpenAI when you ask AI."
      >
        <div className="flex flex-col gap-2 text-[length:var(--text-sm)]">
          <p className="m-0" role="status">
            {state.connecting
              ? "Waiting for sign-in in your browser…"
              : state.sharing
                ? "Connected · Using ChatGPT plan"
                : state.connected
                  ? "Signed in · Plan usage permission required"
                  : "Connect ChatGPT to use AI"}
            {state.account && ` · ${state.account}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.connecting ? (
              <button
                type="button"
                className={scriptButtonClass}
                onClick={() => void send("ai:cancel-sign-in")}
              >
                Cancel sign-in
              </button>
            ) : (
              <button
                type="button"
                className={scriptButtonClass}
                disabled={busy}
                onClick={() => void send("ai:connect")}
              >
                {state.account ? "Reconnect ChatGPT" : "Continue with ChatGPT"}
              </button>
            )}
            {state.connected && (
              <button
                type="button"
                className={scriptButtonClass}
                disabled={busy}
                onClick={() => void send("ai:disconnect")}
              >
                Sign out
              </button>
            )}
            <button
              type="button"
              className={scriptButtonClass}
              onClick={() => void send("ai:manage-usage")}
            >
              Manage usage
            </button>
          </div>
        </div>
      </SettingItem>
      <SettingItem
        label="Global AI defaults"
        description="Used for all subsequent CSS and script requests. Initial default: GPT-6 Luna with High reasoning."
      >
        <div className="flex flex-col gap-2 text-[length:var(--text-sm)]">
          <label className="flex flex-col gap-1">
            Model
            <select
              aria-label="AI model"
              className={scriptInputClass}
              value={state.selection.model}
              disabled={!state.sharing || busy}
              onChange={(event) => {
                const next = state.models.find((m) => m.slug === event.target.value);
                if (next?.efforts.length)
                  void send("ai:set-selection", {
                    model: next.slug,
                    effort: next.efforts.includes(state.selection.effort)
                      ? state.selection.effort
                      : next.efforts[0],
                  });
              }}
            >
              {!model && (
                <option value={state.selection.model}>{state.selection.model} (unavailable)</option>
              )}
              {state.models.map((m) => (
                <option key={m.slug} value={m.slug} disabled={!m.efforts.length}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Reasoning effort
            <select
              aria-label="AI reasoning effort"
              className={scriptInputClass}
              value={state.selection.effort}
              disabled={!state.sharing || !model || busy}
              onChange={(event) =>
                void send("ai:set-selection", {
                  model: state.selection.model,
                  effort: event.target.value,
                })
              }
            >
              {!valid && (
                <option value={state.selection.effort}>
                  {reasoningEffortLabel(state.selection.effort)} (unavailable)
                </option>
              )}
              {model?.efforts.map((effort) => (
                <option key={effort} value={effort}>
                  {reasoningEffortLabel(effort)}
                </option>
              ))}
            </select>
          </label>
          <p className="m-0 text-[var(--muted-foreground)]">
            Only models listed for your ChatGPT account appear here. Refresh models to check for new
            choices.
          </p>
          {model?.efforts.includes(MODEL_DEFAULT_EFFORT) && (
            <p className="m-0 text-[var(--muted-foreground)]">
              Reasoning options are not provided for this model. Requests use its default.
            </p>
          )}
          {state.sharing && !valid && (
            <p role="status" className="m-0 text-[var(--muted-foreground)]">
              Your saved model or effort is unavailable. Choose a supported combination to continue.
            </p>
          )}
          <button
            type="button"
            className={scriptButtonClass}
            disabled={!state.sharing || busy}
            onClick={() => void send("ai:refresh-models")}
          >
            Refresh models
          </button>
        </div>
      </SettingItem>
      {(error || state.error) && (
        <p role="alert" className="text-[length:var(--text-sm)] text-[var(--destructive)]">
          {error ?? state.error}
        </p>
      )}
    </section>
  );
}

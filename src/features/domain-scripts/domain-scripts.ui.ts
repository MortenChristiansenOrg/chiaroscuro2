/** Content-panel controls shared by the script list and editor. */
export const scriptButtonClass =
  "inline-flex min-h-[var(--click-target-min)] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 font-[inherit] text-[length:var(--text-sm)] text-[var(--foreground)] cursor-pointer transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[var(--accent)] active:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[var(--background)] motion-reduce:transition-none";

export const scriptInputClass =
  "min-h-[var(--click-target-min)] w-full rounded-[var(--radius-sm)] border border-[var(--input)] bg-[var(--background)] px-2 py-1.5 text-[length:var(--text-sm)] text-[var(--foreground)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-[var(--ring)] active:border-[var(--ring)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-50 disabled:hover:border-[var(--input)] motion-reduce:transition-none";

export function scriptErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

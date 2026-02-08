import type { ReactNode } from "react";

export function ComponentPreview({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="my-8 rounded-xl border border-border overflow-hidden">
      {label && (
        <div className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/40 border-b border-border">
          {label}
        </div>
      )}
      <div className="p-8 bg-background">{children}</div>
    </div>
  );
}

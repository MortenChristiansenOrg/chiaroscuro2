export function ColorSwatch({
  color,
  name,
  value,
}: { color: string; name: string; value?: string }) {
  return (
    <div className="flex items-center gap-3.5 py-2.5">
      <div
        className="w-11 h-11 rounded-lg border border-border flex-shrink-0 shadow-sm"
        style={{ background: color }}
      />
      <div className="min-w-0">
        <div className="text-[13px] font-medium mb-0.5">{name}</div>
        <code className="text-[11.5px] text-muted-foreground font-mono">{value ?? color}</code>
      </div>
    </div>
  );
}

export function SwatchGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 my-6">{children}</div>;
}

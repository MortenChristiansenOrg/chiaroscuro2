import { useLocation } from "wouter";
import { routes } from "../routes";

export function Sidebar() {
  const [location, setLocation] = useLocation();

  const groups = new Map<string, (typeof routes)[number][]>();
  for (const route of routes) {
    const group = route.group ?? "Overview";
    const arr = groups.get(group);
    if (arr) {
      arr.push(route);
    } else {
      groups.set(group, [route]);
    }
  }

  return (
    <nav className="w-56 flex-shrink-0 border-r border-border h-full overflow-y-auto py-4 px-3">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold tracking-tight">Chiaroscuro</div>
        <div className="text-xs text-muted-foreground">Design System</div>
      </div>
      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group} className="mb-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-2 mb-1">
            {group}
          </div>
          {items.map((r) => {
            const active = location === r.path;
            return (
              <button
                key={r.path}
                type="button"
                onClick={() => setLocation(r.path)}
                className={`w-full text-left text-sm px-2 py-1 rounded-md transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {r.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

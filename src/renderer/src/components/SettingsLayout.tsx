import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FaIconForStyle } from "../../../shared/fa-icons.generated";
import { Icon } from "./Icon";

// ── Settings section registry ───────────────────────────────────

export interface SettingsSectionProps {
  searchQuery: string;
}

export interface SettingsSectionRegistration {
  id: string;
  label: string;
  order: number;
  searchTerms: string[];
  component: ComponentType<SettingsSectionProps>;
}

const sections: SettingsSectionRegistration[] = [];

export function registerSettingsSection(section: SettingsSectionRegistration): void {
  sections.push(section);
  sections.sort((a, b) => a.order - b.order);
}

export function getSettingsSections(): readonly SettingsSectionRegistration[] {
  return sections;
}

// ── Shared styles ───────────────────────────────────────────────

export const settingsInputStyle: React.CSSProperties = {
  padding: "0.375rem 0.5rem",
  fontSize: "var(--text-sm)",
  color: "var(--foreground)",
  background: "var(--background)",
  border: "1px solid var(--input)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

export const settingsSelectStyle: React.CSSProperties = {
  padding: "0.375rem 0.5rem",
  fontSize: "var(--text-sm)",
  color: "var(--foreground)",
  background: "var(--background)",
  border: "1px solid var(--input)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
  fontFamily: "inherit",
  minWidth: "12rem",
};

export const settingsIconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.5rem",
  height: "1.5rem",
  border: "none",
  background: "transparent",
  color: "var(--muted-foreground)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "color var(--duration-fast), background var(--duration-fast)",
};

export const settingsAddButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.375rem 0.75rem",
  fontSize: "var(--text-sm)",
  color: "var(--muted-foreground)",
  background: "transparent",
  border: "1px dashed var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontFamily: "inherit",
  alignSelf: "flex-start",
  transition: "color var(--duration-fast), border-color var(--duration-fast)",
};

export const settingsCategoryHeadingStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted-foreground)",
  margin: "0 0 0.5rem",
  padding: "0.5rem 0",
  borderBottom: "1px solid var(--border)",
};

export const settingsColumnHeaderStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 500,
  color: "var(--muted-foreground)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

// ── SettingItem ─────────────────────────────────────────────────

export function SettingItem({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div style={{ padding: "0.75rem 0" }}>
      <div style={{ marginBottom: "0.25rem" }}>
        <span
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            color: "var(--foreground)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--content-text-secondary)",
          marginBottom: "0.5rem",
        }}
      >
        {description}
      </div>
      {children}
    </div>
  );
}

// ── PageHeader ──────────────────────────────────────────────────

export function PageHeader({
  icon,
  title,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search settings...",
}: {
  icon: FaIconForStyle<"solid">;
  title: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.5rem 2rem 1rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-lg)",
          fontWeight: 600,
          color: "var(--foreground)",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <Icon name={icon} style="solid" css={{ fontSize: "0.875rem" }} />
        {title}
      </h1>
      {onSearchChange != null && (
        <div style={{ position: "relative" }}>
          <Icon
            name="magnifying-glass"
            style="solid"
            css={{
              fontSize: "0.625rem",
              left: "0.625rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-foreground)",
              pointerEvents: "none",
              position: "absolute",
            }}
          />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "14rem",
              padding: "0.375rem 0.625rem 0.375rem 1.75rem",
              fontSize: "var(--text-sm)",
              color: "var(--foreground)",
              background: "var(--background)",
              border: "1px solid var(--input)",
              borderRadius: "var(--radius-sm)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
      )}
    </header>
  );
}

// ── CategoryNav ─────────────────────────────────────────────────

export interface Category {
  id: string;
  label: string;
}

export function CategoryNav({
  categories,
  activeCategory,
  idPrefix = "settings",
}: {
  categories: Category[];
  activeCategory: string;
  idPrefix?: string;
}) {
  return (
    <nav
      style={{
        width: "10rem",
        flexShrink: 0,
        paddingTop: "1rem",
        borderRight: "1px solid var(--border)",
      }}
    >
      {categories.map((cat) => (
        <a
          key={cat.id}
          href={`#${idPrefix}-${cat.id}`}
          style={{
            display: "block",
            padding: "0.375rem 1rem",
            fontSize: "var(--text-sm)",
            color: activeCategory === cat.id ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: activeCategory === cat.id ? 600 : 400,
            textDecoration: "none",
            borderRight:
              activeCategory === cat.id ? "2px solid var(--foreground)" : "2px solid transparent",
            transition: "color var(--duration-fast)",
          }}
        >
          {cat.label}
        </a>
      ))}
    </nav>
  );
}

// ── SettingsLayout ──────────────────────────────────────────────

export function useScrollSpy(idPrefix = "settings") {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace(`${idPrefix}-`, "");
            setActiveCategory(id);
          }
        }
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );

    const sections = container.querySelectorAll(`section[id^='${idPrefix}-']`);
    for (const section of sections) observer.observe(section);

    return () => observer.disconnect();
  }, [idPrefix]);

  return { scrollRef, activeCategory };
}

export function SettingsLayout({
  icon,
  title,
  categories,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  scrollRef,
  activeCategory,
  children,
}: {
  icon: FaIconForStyle<"solid">;
  title: string;
  categories: Category[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  activeCategory: string;
  children: ReactNode;
}) {
  const idPrefix = title.toLowerCase().replace(/\s+/g, "-");

  return (
    <div
      className="dark"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--content-bg)",
        color: "var(--foreground)",
      }}
    >
      <PageHeader
        icon={icon}
        title={title}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {categories.length > 1 && (
          <CategoryNav
            categories={categories}
            activeCategory={activeCategory}
            idPrefix={idPrefix}
          />
        )}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 2rem 2rem",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

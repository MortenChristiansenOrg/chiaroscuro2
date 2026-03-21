import type { BuiltInPageProps } from "../../renderer/src/components/BuiltInPage";
import { SettingsLayout, useScrollSpy } from "../../renderer/src/components/SettingsLayout";
import { PermissionsSection } from "../permissions/permissions.renderer";
import { CssControls } from "./domain-css.renderer";

const categories = [
  { id: "css", label: "Custom CSS" },
  { id: "permissions", label: "Permissions" },
];

export default function DomainSettingsPage({ params }: BuiltInPageProps) {
  const domain = params.domain ?? "";
  const { scrollRef, activeCategory } = useScrollSpy("domain-settings");

  if (!domain) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted-foreground)",
          fontSize: "var(--text-sm)",
        }}
      >
        No domain specified.
      </div>
    );
  }

  return (
    <SettingsLayout
      icon="sliders"
      title={domain}
      categories={categories}
      scrollRef={scrollRef}
      activeCategory={activeCategory}
    >
      <CssControls domain={domain} />
      <PermissionsSection domain={domain} />
    </SettingsLayout>
  );
}

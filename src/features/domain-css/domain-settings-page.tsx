import type { BuiltInPageProps } from "../../renderer/src/components/BuiltInPage";
import { SettingsLayout, useScrollSpy } from "../../renderer/src/components/SettingsLayout";
// Settings-page composition: Scripts owns its renderer state and commands.
import { DomainScriptsSection } from "../domain-scripts/domain-scripts.renderer";
import { PermissionsSection } from "../permissions/permissions.renderer";
import { CssControls, NavigationSettings } from "./domain-css.renderer";

const categories = [
  { id: "navigation", label: "Navigation" },
  { id: "css", label: "Custom CSS" },
  { id: "scripts", label: "Scripts" },
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
      idPrefix="domain-settings"
      categories={categories}
      scrollRef={scrollRef}
      activeCategory={activeCategory}
    >
      <NavigationSettings domain={domain} />
      <CssControls domain={domain} />
      <DomainScriptsSection key={domain} domain={domain} />
      <PermissionsSection domain={domain} />
    </SettingsLayout>
  );
}

import { registerFeature } from "../../renderer/src/Shell";
import { registerBuiltInPage } from "../../renderer/src/components/BuiltInPage";
import { registerSettingsSection } from "../../renderer/src/components/SettingsLayout";
import { DeveloperSettings, SearchSettings } from "./settings.renderer";
import { subscribeToEvents } from "./settings.store";

registerBuiltInPage("app:settings", () => import("./settings.renderer"));

registerSettingsSection({
  id: "search",
  label: "Search",
  order: 10,
  searchTerms: ["search", "provider", "bang", "default search", "url template"],
  component: SearchSettings,
});

registerSettingsSection({
  id: "developer",
  label: "Developer",
  order: 90,
  searchTerms: ["developer", "debug", "server", "port"],
  component: DeveloperSettings,
});

registerFeature({
  name: "settings",
  subscribeToEvents,
});

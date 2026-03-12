import { lazy } from "react";
import { registerFeature } from "../../renderer/src/Shell";
import { registerSettingsSection } from "../../renderer/src/components/SettingsLayout";
import { subscribeToEvents } from "./sso.store";

registerSettingsSection({
  id: "authentication",
  label: "Authentication",
  order: 20,
  searchTerms: [
    "authentication",
    "sso",
    "single sign-on",
    "windows auth",
    "azure",
    "kerberos",
    "ntlm",
  ],
  component: lazy(() => import("./sso.renderer")),
});

registerFeature({
  name: "sso",
  subscribeToEvents,
});

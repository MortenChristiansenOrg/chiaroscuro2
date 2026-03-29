// Feature registrations — each import subscribes to events synchronously (phase 1)
import "../../features/app-state/app-state.feature";
import "../../features/window-chrome/window-chrome.feature";
import "../../features/tabs/tabs.feature";
import "../../features/workspaces/workspaces.feature";
import "../../features/sidebar/sidebar.feature";
import "../../features/pinned-tabs/pinned-tabs.feature";
import "../../features/folders/folders.feature";
import "../../features/command-palette/command-palette.feature";
import "../../features/settings/settings.feature";
import "../../features/domain-css/domain-css.feature";
import "../../features/downloads/downloads.feature";
import "../../features/find-text/find-text.feature";
import "../../features/tab-customization/tab-customization.feature";
import "../../features/terminal/terminal.feature";
import "../../features/local-web-app/local-web-app.feature";
import "../../features/installer/installer.feature";
import "../../features/sub-tabs/sub-tabs.feature";
import "../../features/permissions/permissions.feature";
import "../../features/pdf-reader/pdf-reader.feature";

// All subscriptions wired — tell main process to start emitting events (phase 2)
import { Shell, signalReady } from "./Shell";
signalReady();

export default function App() {
  return <Shell />;
}

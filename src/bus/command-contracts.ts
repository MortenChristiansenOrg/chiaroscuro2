import { commandContracts as appStateContracts } from "../features/app-state/app-state.contracts";
import { commandContracts as commandPaletteContracts } from "../features/command-palette/command-palette.contracts";
import { commandContracts as contextMenuContracts } from "../features/context-menu/context-menu.contracts";
import { commandContracts as debugServerContracts } from "../features/debug-server/debug-server.contracts";
import { commandContracts as devToolsContracts } from "../features/dev-tools/dev-tools.contracts";
import { commandContracts as domainCssContracts } from "../features/domain-css/domain-css.contracts";
import { commandContracts as downloadsContracts } from "../features/downloads/downloads.contracts";
import { commandContracts as externalLinkContracts } from "../features/external-link/external-link.contracts";
import { commandContracts as findTextContracts } from "../features/find-text/find-text.contracts";
import { commandContracts as foldersContracts } from "../features/folders/folders.contracts";
import { commandContracts as installerContracts } from "../features/installer/installer.contracts";
import { commandContracts as localWebAppContracts } from "../features/local-web-app/local-web-app.contracts";
import { commandContracts as pdfReaderContracts } from "../features/pdf-reader/pdf-reader.contracts";
import { commandContracts as permissionsContracts } from "../features/permissions/permissions.contracts";
import { commandContracts as pinnedTabsContracts } from "../features/pinned-tabs/pinned-tabs.contracts";
import { commandContracts as pipContracts } from "../features/pip/pip.contracts";
import { commandContracts as settingsContracts } from "../features/settings/settings.contracts";
import { commandContracts as sidebarContracts } from "../features/sidebar/sidebar.contracts";
import { commandContracts as subTabsContracts } from "../features/sub-tabs/sub-tabs.contracts";
import { commandContracts as tabContextMenuContracts } from "../features/tab-context-menu/tab-context-menu.contracts";
import { commandContracts as tabCustomizationContracts } from "../features/tab-customization/tab-customization.contracts";
import { commandContracts as tabsContracts } from "../features/tabs/tabs.contracts";
import { commandContracts as terminalContracts } from "../features/terminal/terminal.contracts";
import { commandContracts as tooltipContracts } from "../features/tooltip/tooltip.contracts";
import { commandContracts as windowChromeContracts } from "../features/window-chrome/window-chrome.contracts";
import { commandContracts as workspacesContracts } from "../features/workspaces/workspaces.contracts";
import { commandContracts as zoomContracts } from "../features/zoom/zoom.contracts";

export const commandContracts = {
  ...appStateContracts,
  ...commandPaletteContracts,
  ...contextMenuContracts,
  ...debugServerContracts,
  ...devToolsContracts,
  ...domainCssContracts,
  ...downloadsContracts,
  ...externalLinkContracts,
  ...findTextContracts,
  ...foldersContracts,
  ...installerContracts,
  ...localWebAppContracts,
  ...pdfReaderContracts,
  ...permissionsContracts,
  ...pinnedTabsContracts,
  ...pipContracts,
  ...settingsContracts,
  ...sidebarContracts,
  ...subTabsContracts,
  ...tabContextMenuContracts,
  ...tabCustomizationContracts,
  ...tabsContracts,
  ...terminalContracts,
  ...tooltipContracts,
  ...windowChromeContracts,
  ...workspacesContracts,
  ...zoomContracts,
};

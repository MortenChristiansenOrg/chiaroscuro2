export const BITWARDEN_ID = "nngceckbapebfimnlniiiahkandclblb";
export const EXTENSIONS_OPEN = "extensions:open" as const;
export const EXTENSIONS_INSTALL = "extensions:install" as const;
export const EXTENSIONS_UNINSTALL = "extensions:uninstall" as const;
export const EXTENSIONS_SET_ENABLED = "extensions:set-enabled" as const;
export const EXTENSIONS_OPEN_POPUP = "extensions:open-popup" as const;
export const EXTENSIONS_CHECK_UPDATES = "extensions:check-updates" as const;
export const EXTENSIONS_APPROVE = "extensions:approve" as const;
export const EXTENSIONS_CHANGED = "extensions:changed" as const;
export interface ExtensionAction {
  popup: string;
  title: string;
  iconUrl: string;
}
export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed?: boolean;
  action?: ExtensionAction;
  iconUrl?: string;
  loaded?: boolean;
  busy?: boolean;
  error?: string;
  lastChecked?: number;
  updateVersion?: string;
  review?: { token: string; permissions: string[] };
  restartRequired?: boolean;
}
export interface ExtensionsChangedEvent {
  extensions: InstalledExtension[];
}
export type ExtensionsCommands = {
  [EXTENSIONS_OPEN]: { payload: undefined; response: undefined };
  [EXTENSIONS_INSTALL]: { payload: { extensionId: string; name: string }; response: undefined };
  [EXTENSIONS_UNINSTALL]: { payload: { extensionId: string }; response: undefined };
  [EXTENSIONS_SET_ENABLED]: {
    payload: { extensionId: string; enabled: boolean };
    response: undefined;
  };
  [EXTENSIONS_OPEN_POPUP]: { payload: { extensionId: string }; response: undefined };
  [EXTENSIONS_CHECK_UPDATES]: { payload: { extensionId: string }; response: undefined };
  [EXTENSIONS_APPROVE]: { payload: { extensionId: string; token: string }; response: undefined };
};
export type ExtensionsEvents = { [EXTENSIONS_CHANGED]: ExtensionsChangedEvent };

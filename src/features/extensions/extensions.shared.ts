// ── Command names ──────────────────────────────────────────────
export const EXTENSIONS_OPEN = "extensions:open" as const;
export const EXTENSIONS_SEARCH = "extensions:search" as const;
export const EXTENSIONS_INSTALL = "extensions:install" as const;
export const EXTENSIONS_UNINSTALL = "extensions:uninstall" as const;
export const EXTENSIONS_SET_ENABLED = "extensions:set-enabled" as const;

// ── Event names ────────────────────────────────────────────────
export const EXTENSIONS_CHANGED = "extensions:changed" as const;
export const EXTENSIONS_INSTALL_STARTED = "extensions:install-started" as const;
export const EXTENSIONS_INSTALL_COMPLETED = "extensions:install-completed" as const;
export const EXTENSIONS_INSTALL_FAILED = "extensions:install-failed" as const;
export const EXTENSIONS_SEARCH_RESULTS = "extensions:search-results" as const;

// ── Payload types ──────────────────────────────────────────────
export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

export interface CWSSearchResult {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  /** Whether this extension is "Featured" on CWS (manually reviewed by Chrome team). */
  featured: boolean;
  /** Average star rating (0–5), or null if unrated. */
  rating: number | null;
  /** Number of ratings, or null if unrated. */
  ratingCount: number | null;
  /** Approximate user count (e.g. 6000000), or null if unknown. */
  userCount: number | null;
}

export interface ExtensionsSearchPayload {
  query: string;
}

export interface ExtensionsInstallPayload {
  extensionId: string;
  name: string;
}

export interface ExtensionsUninstallPayload {
  extensionId: string;
}

export interface ExtensionsSetEnabledPayload {
  extensionId: string;
  enabled: boolean;
}

export interface ExtensionsChangedEvent {
  extensions: InstalledExtension[];
}

export interface ExtensionsInstallStartedEvent {
  extensionId: string;
}

export interface ExtensionsInstallCompletedEvent {
  extensionId: string;
}

export interface ExtensionsInstallFailedEvent {
  extensionId: string;
  error: string;
}

export interface ExtensionsSearchResultsEvent {
  query: string;
  results: CWSSearchResult[];
}

// ── Command registry ───────────────────────────────────────────
export type ExtensionsCommands = {
  [EXTENSIONS_OPEN]: { payload: undefined; response: undefined };
  [EXTENSIONS_SEARCH]: { payload: ExtensionsSearchPayload; response: CWSSearchResult[] };
  [EXTENSIONS_INSTALL]: { payload: ExtensionsInstallPayload; response: undefined };
  [EXTENSIONS_UNINSTALL]: { payload: ExtensionsUninstallPayload; response: undefined };
  [EXTENSIONS_SET_ENABLED]: { payload: ExtensionsSetEnabledPayload; response: undefined };
};

// ── Event registry ─────────────────────────────────────────────
export type ExtensionsEvents = {
  [EXTENSIONS_CHANGED]: ExtensionsChangedEvent;
  [EXTENSIONS_INSTALL_STARTED]: ExtensionsInstallStartedEvent;
  [EXTENSIONS_INSTALL_COMPLETED]: ExtensionsInstallCompletedEvent;
  [EXTENSIONS_INSTALL_FAILED]: ExtensionsInstallFailedEvent;
  [EXTENSIONS_SEARCH_RESULTS]: ExtensionsSearchResultsEvent;
};

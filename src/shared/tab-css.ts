/**
 * IPC between the main process and the tab preload for injected tab CSS. Main sends an
 * insert or remove with a key it chose; the preload answers on TAB_CSS_DONE.
 */
export const TAB_CSS_INSERT = "tab:css-insert";
export const TAB_CSS_REMOVE = "tab:css-remove";
export const TAB_CSS_DONE = "tab:css-done";

export type TabCssOperation = "insert" | "remove";

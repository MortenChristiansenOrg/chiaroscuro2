import { webFrame } from "electron";

/**
 * Electron hit-tests every WebContentsView in a window against its page's `app-region` (#51).
 * A site written for a desktop shell, such as chatgpt.com, would then drag the browser window
 * from its own header. A hidden tab sits at the window's origin, so its header covers the top
 * bar and swallows clicks on the browser's controls. Only the shell defines drag regions.
 *
 * A user-origin `!important` rule wins over every author declaration, including inline
 * `!important` ones. It is inserted before the page lays out, so no region is ever sent.
 */
export const NO_APP_REGION_CSS = "*, ::before, ::after { app-region: none !important; }";

export function disableAppRegions(): void {
  webFrame.insertCSS(NO_APP_REGION_CSS, { cssOrigin: "user" });
}

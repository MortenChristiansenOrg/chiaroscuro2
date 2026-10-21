import { webFrame } from "electron";

/**
 * Pseudo-elements that can generate their own box, and so their own region. Each gets its own
 * rule: a selector Chromium does not know would invalidate a whole selector list.
 */
const BOX_PSEUDO_ELEMENTS = [
  "::before",
  "::after",
  "::backdrop",
  "::marker",
  "::file-selector-button",
  "::details-content",
  "::picker(select)",
  "::scroll-marker",
  "::scroll-marker-group",
  "::scroll-button(*)",
  "::column",
  "::view-transition",
  "::view-transition-group(*)",
  "::view-transition-image-pair(*)",
  "::view-transition-old(*)",
  "::view-transition-new(*)",
];

/**
 * Electron hit-tests every WebContentsView in a window against its page's `app-region` (#51).
 * A site written for a desktop shell, such as chatgpt.com, would then drag the browser window
 * from its own header. A hidden tab sits at the window's origin, so its header covers the top
 * bar and swallows clicks on the browser's controls. Only the shell defines drag regions.
 *
 * A user-origin `!important` rule wins over every author declaration, including inline
 * `!important` ones. Any explicit value, `none` included, makes Chromium send a no-drag rect
 * for that box, so everything but the root goes back to `initial`, which sends nothing. The
 * root's single no-drag rect keeps Chromium sending updates, so no earlier region lingers.
 */
export const NO_APP_REGION_CSS = [
  ":root { app-region: none !important; }",
  ":not(:root) { app-region: initial !important; }",
  ...BOX_PSEUDO_ELEMENTS.map((pseudo) => `${pseudo} { app-region: initial !important; }`),
].join("\n");

/** Call before the page lays out, so its own `app-region` never reaches the window. */
export function disableAppRegions(): void {
  webFrame.insertCSS(NO_APP_REGION_CSS, { cssOrigin: "user" });
}

export declare const SIDEBAR_TOGGLE: "sidebar:toggle";
export declare const SIDEBAR_VISIBILITY_CHANGED: "sidebar:visibility-changed";
export interface SidebarVisibilityChangedPayload {
  visible: boolean;
}
export type SidebarCommands = {
  [SIDEBAR_TOGGLE]: {
    payload: undefined;
    response: undefined;
  };
};
export type SidebarEvents = {
  [SIDEBAR_VISIBILITY_CHANGED]: SidebarVisibilityChangedPayload;
};

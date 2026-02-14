import type { TabId } from "../../shared/types";
export declare const WINDOW_MINIMIZE: "window:minimize";
export declare const WINDOW_MAXIMIZE_RESTORE: "window:maximize-restore";
export declare const WINDOW_CLOSE: "window:close";
export declare const WINDOW_COPY_ADDRESS: "window:copy-address";
export declare const WINDOW_GO_BACK: "window:go-back";
export declare const WINDOW_GO_FORWARD: "window:go-forward";
export declare const WINDOW_RELOAD: "window:reload";
export declare const WINDOW_MAXIMIZED_CHANGED: "window:maximized-changed";
export declare const TAB_LOADING_CHANGED: "tab:loading-changed";
export interface MaximizedChangedPayload {
  maximized: boolean;
}
export interface TabLoadingChangedPayload {
  tabId: TabId;
  loading: boolean;
}
export type WindowChromeCommands = {
  [WINDOW_MINIMIZE]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_MAXIMIZE_RESTORE]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_CLOSE]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_COPY_ADDRESS]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_GO_BACK]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_GO_FORWARD]: {
    payload: undefined;
    response: undefined;
  };
  [WINDOW_RELOAD]: {
    payload: undefined;
    response: undefined;
  };
};
export type WindowChromeEvents = {
  [WINDOW_MAXIMIZED_CHANGED]: MaximizedChangedPayload;
  [TAB_LOADING_CHANGED]: TabLoadingChangedPayload;
};

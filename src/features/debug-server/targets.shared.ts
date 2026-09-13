import type { Bounds } from "../../shared/types";

/** IDs are stable for the lifetime of their native object; tab IDs survive restart. */
export interface DebugTarget {
  id: string;
  kind:
    | "shell"
    | "window"
    | "palette"
    | "sub-tab-frame"
    | "tooltip"
    | "tab"
    | "sub-tab"
    | "built-in";
  windowId: number | null;
  parentId: string | null;
  tabId?: string;
  webContentsId: number;
  cdpTargetId: string;
  url: string;
  title: string;
  bounds: Bounds;
  visible: boolean;
  focused: boolean;
}

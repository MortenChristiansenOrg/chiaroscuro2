/** Branded type helper — prevents accidental assignment of raw strings */
type Brand<T, B extends string> = T & {
  readonly __brand: B;
};
export type TabId = Brand<string, "TabId">;
export type WindowId = Brand<string, "WindowId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type FolderId = Brand<string, "FolderId">;
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

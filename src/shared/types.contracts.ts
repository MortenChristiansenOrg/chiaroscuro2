import { z } from "zod";
import type { FolderId, TabId, WindowId, WorkspaceId } from "./types";

export const BoundsSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const TabIdSchema = z.string().min(1) as unknown as z.ZodType<TabId>;

export const FolderIdSchema = z.string().min(1) as unknown as z.ZodType<FolderId>;

export const WorkspaceIdSchema = z.string().min(1) as unknown as z.ZodType<WorkspaceId>;

export const WindowIdSchema = z.string().min(1) as unknown as z.ZodType<WindowId>;

/** URLs accepted by app navigation, including built-in pages and local documents. */
export const NavigationUrlSchema = z
  .url()
  .regex(/^(https?|file|about|data|app):/i, "Unsupported navigation protocol");

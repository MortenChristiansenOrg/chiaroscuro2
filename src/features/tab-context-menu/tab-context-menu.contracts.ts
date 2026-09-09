import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  TAB_CONTEXT_MENU_COPY_IMAGE,
  TAB_CONTEXT_MENU_COPY_TEXT,
  TAB_CONTEXT_MENU_DOWNLOAD_IMAGE,
  TAB_CONTEXT_MENU_SEARCH_TEXT,
} from "./tab-context-menu.shared";

export const CopyTextPayloadSchema = z.strictObject({ text: z.string() });

export const CopyImagePayloadSchema = z.strictObject({
  tabId: TabIdSchema,
  x: z.number(),
  y: z.number(),
});

export const DownloadImagePayloadSchema = z.strictObject({ url: z.string(), tabId: TabIdSchema });

export const SearchTextPayloadSchema = z.strictObject({ text: z.string() });

export const commandContracts = {
  [TAB_CONTEXT_MENU_COPY_TEXT]: defineCommand(CopyTextPayloadSchema, z.undefined(), {
    description: "Copy supplied text to the clipboard.",
    examples: [{ text: "example text" }],
    sideEffects: ["Writes the system clipboard"],
  }),
  [TAB_CONTEXT_MENU_COPY_IMAGE]: defineCommand(CopyImagePayloadSchema, z.undefined(), {
    description: "Copy the image at a point in a tab.",
    examples: [{ tabId: "tab-example", x: 0, y: 0 }],
    sideEffects: ["Writes the system clipboard"],
  }),
  [TAB_CONTEXT_MENU_DOWNLOAD_IMAGE]: defineCommand(DownloadImagePayloadSchema, z.undefined(), {
    description: "Download an image from a tab's context menu.",
    examples: [{ url: "https://example.com/", tabId: "tab-example" }],
    sideEffects: ["Starts a file download"],
  }),
  [TAB_CONTEXT_MENU_SEARCH_TEXT]: defineCommand(SearchTextPayloadSchema, z.undefined(), {
    description: "Search the web for selected text.",
    examples: [{ text: "example text" }],
    sideEffects: ["Opens a search tab"],
  }),
};

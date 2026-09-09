import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { DOWNLOADS_CANCEL, DOWNLOADS_PAUSE, DOWNLOADS_RESUME } from "./downloads.shared";

export const DownloadIdPayloadSchema = z.strictObject({ downloadId: z.string() });

export const commandContracts = {
  [DOWNLOADS_CANCEL]: defineCommand(DownloadIdPayloadSchema, z.undefined(), {
    description: "Cancel a download by its ID.",
    examples: [{ downloadId: "example" }],
    sideEffects: ["Cancels network transfer"],
  }),
  [DOWNLOADS_PAUSE]: defineCommand(DownloadIdPayloadSchema, z.undefined(), {
    description: "Pause a download by its ID.",
    examples: [{ downloadId: "example" }],
    sideEffects: ["Pauses network transfer"],
  }),
  [DOWNLOADS_RESUME]: defineCommand(DownloadIdPayloadSchema, z.undefined(), {
    description: "Resume a paused download by its ID.",
    examples: [{ downloadId: "example" }],
    sideEffects: ["Resumes network transfer"],
  }),
};

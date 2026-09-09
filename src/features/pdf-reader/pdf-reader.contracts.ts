import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  PDF_READER_FETCH,
  PDF_READER_GET_INDEX,
  PDF_READER_INDEX_ADD,
  PDF_READER_INDEX_DELETE,
  PDF_READER_INDEX_REORDER,
  PDF_READER_INDEX_UPDATE,
  PDF_READER_SET_ZOOM,
} from "./pdf-reader.shared";

export const PdfFetchPayloadSchema = z.strictObject({ url: z.string() });

export const PdfFetchResponseSchema = z.strictObject({
  dataBase64: z.string(),
  hash: z.string(),
  filename: z.string(),
  zoom: z.number(),
});

export const PdfGetIndexPayloadSchema = z.strictObject({ pdfKey: z.string().min(1) });

export const IndexEntrySchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  page: z.number().int().min(1),
  order: z.number(),
});

export const PdfIndexAddPayloadSchema = z.strictObject({
  pdfKey: z.string().min(1),
  label: z.string(),
  page: z.number().int().min(1),
});

export const PdfIndexUpdatePayloadSchema = z.strictObject({
  pdfKey: z.string().min(1),
  entryId: z.string(),
  label: z.string().optional(),
  page: z.number().int().min(1).optional(),
});

export const PdfIndexDeletePayloadSchema = z.strictObject({
  pdfKey: z.string().min(1),
  entryId: z.string(),
});

export const PdfIndexReorderPayloadSchema = z.strictObject({
  pdfKey: z.string().min(1),
  entryIds: z.array(z.string()),
});

export const commandContracts = {
  [PDF_READER_SET_ZOOM]: defineCommand(
    z.strictObject({ pdfKey: z.string().min(1), zoom: z.number().min(0.25).max(5) }),
    z.undefined(),
    {
      description: "Save PDF zoom as a factor between 0.25 and 5.",
      examples: [{ pdfKey: "document.pdf:example-hash", zoom: 1 }],
      sideEffects: ["Writes the PDF zoom preference"],
    },
  ),
  [PDF_READER_FETCH]: defineCommand(PdfFetchPayloadSchema, PdfFetchResponseSchema, {
    description: "Read a PDF and return base64 data, identity, and saved zoom.",
    examples: [{ url: "https://example.com/" }],
    sideEffects: ["Reads a local file or fetches the document over the network"],
  }),
  [PDF_READER_GET_INDEX]: defineCommand(PdfGetIndexPayloadSchema, z.array(IndexEntrySchema), {
    description: "Read the custom PDF index.",
    examples: [{ pdfKey: "document.pdf:example-hash" }],
    sideEffects: [],
  }),
  [PDF_READER_INDEX_ADD]: defineCommand(PdfIndexAddPayloadSchema, z.undefined(), {
    description: "Add a labeled page to a PDF's custom index.",
    examples: [{ pdfKey: "document.pdf:example-hash", label: "Chapter one", page: 1 }],
    sideEffects: ["Writes PDF index metadata"],
  }),
  [PDF_READER_INDEX_UPDATE]: defineCommand(PdfIndexUpdatePayloadSchema, z.undefined(), {
    description: "Update the label or page of a custom PDF index entry.",
    examples: [{ pdfKey: "document.pdf:example-hash", entryId: "entry-example" }],
    sideEffects: ["Writes PDF index metadata"],
  }),
  [PDF_READER_INDEX_DELETE]: defineCommand(PdfIndexDeletePayloadSchema, z.undefined(), {
    description: "Delete a custom PDF index entry.",
    examples: [{ pdfKey: "document.pdf:example-hash", entryId: "entry-example" }],
    sideEffects: ["Deletes PDF index metadata"],
  }),
  [PDF_READER_INDEX_REORDER]: defineCommand(PdfIndexReorderPayloadSchema, z.undefined(), {
    description: "Reorder custom PDF index entries by ID.",
    examples: [{ pdfKey: "document.pdf:example-hash", entryIds: [] }],
    sideEffects: ["Writes PDF index ordering"],
  }),
};
